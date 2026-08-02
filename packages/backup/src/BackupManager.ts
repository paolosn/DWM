import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupProvider } from "./BackupProvider.js";
import type { BackupSourceResolver, ResolvedBackupResource } from "./BackupSourceResolver.js";
import { ManagedBackupSourceResolver } from "./BackupSourceResolver.js";
import { BackupRegistry, type BackupFilter } from "./BackupRegistry.js";
import { BackupStore, type PersistedBackup } from "./BackupStore.js";
import { BackupValidator } from "./BackupValidator.js";
import { IntegrityVerifier, computeChecksum, type IntegrityResult } from "./IntegrityVerifier.js";
import type { BackupRequest } from "./BackupRequest.js";
import type { BackupResult, BackupIssue } from "./BackupResult.js";
import type { BackupManifest } from "./BackupManifest.js";
import { BACKUP_FORMAT_VERSION } from "./BackupManifest.js";
import { makeBackupProgress } from "./BackupProgress.js";
import type { BackupDescriptor } from "./BackupDescriptor.js";
import type { BackupPolicy } from "./BackupPolicy.js";
import { validateRetentionPolicy, type RetentionPolicy } from "./RetentionPolicy.js";
import { isTerminalBackupState } from "./BackupState.js";
import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { BackupError, createBackupError } from "./errors/BackupError.js";

export interface BackupManagerOptions {
  readonly catalogDir: string;
  readonly providers: readonly BackupProvider[];
  readonly sourceResolver?: BackupSourceResolver;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  readonly retentionCheckIntervalMs?: number;
  readonly defaultRetentionPolicy?: RetentionPolicy;
}

export interface DeleteBackupOptions {
  readonly force?: boolean;
}

export interface ApplyRetentionOptions {
  readonly dryRun?: boolean;
}

export interface RetentionResult {
  readonly toDelete: readonly string[];
  readonly kept: readonly string[];
}

type BackupEventPhase =
  | "requested"
  | "preparing.started"
  | "started"
  | "progress.updated"
  | "verification.started"
  | "verification.completed"
  | "completed"
  | "completed.with_warnings"
  | "cancellation.requested"
  | "cancelled"
  | "failed"
  | "delete.started"
  | "deleted"
  | "retention.evaluated"
  | "retention.applied";

const RETENTION_TASK_ID = "backup-retention-check";

/**
 * Sistema central de copias de seguridad del sistema DWM. Implementa
 * `IModule` (ADR-002 §3): se registra en el Core mediante
 * `registerModule`, recibe únicamente el `ModuleContext` mínimo. No copia
 * nunca secretos en claro (solo referencias), no implementa proveedores
 * remotos todavía, y deja el sistema en un estado consistente ante
 * cualquier fallo parcial (nunca declara éxito falso).
 */
export class BackupManager implements IModule {
  readonly id = "backup-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new BackupRegistry();
  private readonly store: BackupStore;
  private readonly validator = new BackupValidator();
  private readonly integrityVerifier = new IntegrityVerifier();
  private readonly sourceResolver: BackupSourceResolver;
  private readonly providers = new Map<string, BackupProvider>();
  private readonly busy = new Set<string>();
  private readonly cancelFlags = new Set<string>();
  private readonly scheduledTasks = new Map<string, TaskHandle>();

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly retentionCheckIntervalMs?: number;
  private readonly defaultRetentionPolicy?: RetentionPolicy;
  private retentionTaskHandle?: TaskHandle;

  constructor(options: BackupManagerOptions) {
    if (!options || typeof options.catalogDir !== "string" || options.catalogDir.length === 0) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INVALID_REQUEST,
        message: "BackupManagerOptions.catalogDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    if (!Array.isArray(options.providers) || options.providers.length === 0) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INVALID_REQUEST,
        message: "BackupManagerOptions.providers debe incluir al menos un BackupProvider.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new BackupStore(options.catalogDir);
    for (const provider of options.providers) this.providers.set(provider.id, provider);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.retentionCheckIntervalMs)
      this.retentionCheckIntervalMs = options.retentionCheckIntervalMs;
    if (options.defaultRetentionPolicy)
      this.defaultRetentionPolicy = options.defaultRetentionPolicy;

    this.sourceResolver =
      options.sourceResolver ??
      new ManagedBackupSourceResolver({
        ...(options.workspaceManager ? { workspaceManager: options.workspaceManager } : {}),
        ...(options.profileManager ? { profileManager: options.profileManager } : {}),
        ...(options.projectManager ? { projectManager: options.projectManager } : {}),
        ...(options.pluginManager ? { pluginManager: options.pluginManager } : {}),
        ...(options.configManager ? { configManager: options.configManager } : {}),
        ...(options.secretsManager ? { secretsManager: options.secretsManager } : {}),
      });
  }

  // ---------------------------------------------------------------------
  // Creación de backups
  // ---------------------------------------------------------------------

  async createBackup(request: BackupRequest): Promise<BackupResult> {
    this.validator.assertValidRequest(request);
    const provider = this.requireProvider(request.target.providerId);
    const lockKey = `target:${request.target.providerId}:${request.target.path}`;

    return this.withLock(lockKey, async () => {
      let baseManifest: BackupManifest | undefined;
      if (request.type === "incremental") {
        const baseRecord = this.registry.get(request.baseBackupId as string);
        if (
          !baseRecord ||
          (baseRecord.state !== "completed" && baseRecord.state !== "completed_with_warnings")
        ) {
          throw createBackupError({
            code: BackupErrorCode.BACKUP_BASE_MISSING,
            message: `El backup base "${request.baseBackupId}" no existe o no está completado.`,
            origin: "chain",
            recoverable: true,
          });
        }
        baseManifest = baseRecord.manifest;
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const provisionalManifest: BackupManifest = {
        id,
        type: request.type,
        createdAt: now,
        includedResources: request.resources,
        excludedPaths: request.excludedPaths ?? [],
        target: request.target,
        providerId: request.target.providerId,
        formatVersion: BACKUP_FORMAT_VERSION,
        ...(request.name !== undefined ? { name: request.name } : {}),
        ...(request.description !== undefined ? { description: request.description } : {}),
        ...(request.createdBy !== undefined ? { createdBy: request.createdBy } : {}),
        ...(request.baseBackupId !== undefined ? { baseBackupId: request.baseBackupId } : {}),
        ...(request.metadata !== undefined ? { metadata: request.metadata } : {}),
      };
      this.registry.register(provisionalManifest, "pending");
      await this.notify("requested", id);

      try {
        return await this.runBackup(id, request, provider, baseManifest);
      } catch (err) {
        const wrapped = BackupError.wrap(err, {
          code: BackupErrorCode.BACKUP_WRITE_FAILED,
          origin: "lifecycle",
          recoverable: true,
        });
        const record = this.registry.get(id);
        if (record && !isTerminalBackupState(record.state) && record.state !== "deleted") {
          this.registry.addError(id, { code: wrapped.code, message: wrapped.message });
          this.trySetState(id, "failed");
          await this.persist(id).catch(() => {});
          await this.notify("failed", id);
        }
        throw wrapped;
      } finally {
        this.cancelFlags.delete(id);
      }
    });
  }

  private async runBackup(
    id: string,
    request: BackupRequest,
    provider: BackupProvider,
    baseManifest: BackupManifest | undefined
  ): Promise<BackupResult> {
    this.registry.setState(id, "preparing");
    await this.notify("preparing.started", id);

    try {
      await provider.list(request.target);
    } catch (err) {
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_INVALID_TARGET,
        origin: "target",
        recoverable: true,
        message: "El destino de backup no está disponible.",
      });
    }

    const resolved: ResolvedBackupResource[] = [];
    for (const resource of request.resources) {
      if (this.cancelFlags.has(id)) {
        await this.finalizeCancelled(id);
        return this.toResult(id);
      }
      const result = await this.sourceResolver.resolve(resource);
      if (!result.exists) {
        if (resource.required !== false) {
          throw createBackupError({
            code: BackupErrorCode.BACKUP_RESOURCE_NOT_FOUND,
            message: `El recurso "${resource.resourceType}:${resource.resourceId}" no existe.`,
            origin: "resource",
            recoverable: true,
          });
        }
        this.registry.addWarning(id, {
          code: BackupErrorCode.BACKUP_RESOURCE_NOT_FOUND,
          message: `Recurso opcional ausente: "${resource.resourceType}:${resource.resourceId}".`,
        });
      }
      resolved.push(result);
    }

    const estimatedBytes = Buffer.byteLength(JSON.stringify(resolved), "utf-8");
    if (provider.checkCapacity && !(await provider.checkCapacity(request.target, estimatedBytes))) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INSUFFICIENT_SPACE,
        message: "El proveedor de destino no dispone de espacio suficiente.",
        origin: "target",
        recoverable: true,
      });
    }

    this.registry.setState(id, "running");
    await this.notify("started", id);

    let itemsProcessed = 0;
    let bytesProcessed = 0;
    const payloadItems: Record<string, unknown> = {};
    for (const resolvedResource of resolved) {
      if (this.cancelFlags.has(id)) {
        await this.finalizeCancelled(id);
        return this.toResult(id);
      }
      const key = `${resolvedResource.resource.resourceType}:${resolvedResource.resource.resourceId}`;
      payloadItems[key] = resolvedResource.snapshot ?? null;
      itemsProcessed += 1;
      bytesProcessed += Buffer.byteLength(
        JSON.stringify(resolvedResource.snapshot ?? null),
        "utf-8"
      );
      this.registry.setProgress(
        id,
        makeBackupProgress("copying", itemsProcessed, bytesProcessed, {
          itemsTotal: resolved.length,
          currentResource: key,
        })
      );
      await this.notify("progress.updated", id);
    }

    let changedResourceIds: string[] | undefined;
    if (request.type === "incremental" && baseManifest) {
      const baseKeys = new Set(
        baseManifest.includedResources.map((r) => `${r.resourceType}:${r.resourceId}`)
      );
      changedResourceIds = Object.keys(payloadItems).filter((key) => !baseKeys.has(key));
    }

    const payload = JSON.stringify({ backupId: id, items: payloadItems }, null, 2);
    const checksum = computeChecksum(payload);
    const sizeBytes = Buffer.byteLength(payload, "utf-8");

    await provider.write(request.target, id, payload);

    this.registry.setState(id, "verifying");
    await this.notify("verification.started", id);

    const currentManifest = this.registry.require(id).manifest;
    const finalManifest: BackupManifest = {
      ...currentManifest,
      startedAt: currentManifest.createdAt,
      completedAt: new Date().toISOString(),
      sizeBytes,
      itemCount: itemsProcessed,
      checksum,
      ...(changedResourceIds ? { changedResourceIds } : {}),
    };
    this.registry.replaceManifest(id, finalManifest);

    const content = await provider.read(request.target, id);
    const integrity = this.integrityVerifier.verify(
      finalManifest,
      content,
      baseManifest,
      request.type === "incremental"
    );
    await this.notify("verification.completed", id);

    if (integrity.status === "invalid" || integrity.status === "unverifiable") {
      for (const issue of integrity.issues) {
        this.registry.addError(id, {
          code: BackupErrorCode.BACKUP_INTEGRITY_INVALID,
          message: issue,
        });
      }
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INTEGRITY_INVALID,
        message: `El backup "${id}" no superó la verificación de integridad.`,
        origin: "verification",
        recoverable: true,
      });
    }
    if (integrity.status === "valid_with_warnings") {
      for (const issue of integrity.issues) {
        this.registry.addWarning(id, {
          code: BackupErrorCode.BACKUP_VERIFICATION_FAILED,
          message: issue,
        });
      }
    }

    const hasWarnings = this.registry.require(id).warnings.length > 0;
    this.registry.setState(id, hasWarnings ? "completed_with_warnings" : "completed");
    await this.persist(id);
    await this.notify(hasWarnings ? "completed.with_warnings" : "completed", id);

    return this.toResult(id);
  }

  private async finalizeCancelled(id: string): Promise<void> {
    await this.notify("cancellation.requested", id);
    this.trySetState(id, "cancelling");
    this.trySetState(id, "cancelled");
    await this.persist(id).catch(() => {});
    await this.notify("cancelled", id);
  }

  async cancelBackup(id: string): Promise<void> {
    const record = this.registry.require(id);
    if (record.state === "cancelled") return;
    if (
      isTerminalBackupState(record.state) ||
      record.state === "deleting" ||
      record.state === "deleted"
    ) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_CANCELLATION_NOT_ALLOWED,
        message: `El backup "${id}" ya finalizó ("${record.state}") y no puede cancelarse.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }

    this.cancelFlags.add(id);

    if (record.state === "pending") {
      await this.notify("cancellation.requested", id);
      this.registry.setState(id, "cancelling");
      this.registry.setState(id, "cancelled");
      await this.persist(id);
      await this.notify("cancelled", id);
      return;
    }

    await this.notify("cancellation.requested", id);
  }

  // ---------------------------------------------------------------------
  // Consulta y catálogo
  // ---------------------------------------------------------------------

  getBackup(id: string): BackupDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listBackups(): string[] {
    return this.registry.list();
  }

  filterBackups(criteria: BackupFilter): string[] {
    return this.registry.filter(criteria);
  }

  setBackupPolicy(id: string, policy: BackupPolicy): void {
    this.registry.setPolicy(id, policy);
  }

  // ---------------------------------------------------------------------
  // Integridad
  // ---------------------------------------------------------------------

  async verifyIntegrity(id: string): Promise<IntegrityResult> {
    return this.withLock(`backup:${id}`, async () => {
      const record = this.registry.require(id);
      const provider = this.requireProvider(record.manifest.providerId);
      const content = await provider.read(record.manifest.target, id);
      const baseManifest = record.manifest.baseBackupId
        ? this.registry.get(record.manifest.baseBackupId)?.manifest
        : undefined;
      return this.integrityVerifier.verify(
        record.manifest,
        content,
        baseManifest,
        record.manifest.type === "incremental"
      );
    });
  }

  // ---------------------------------------------------------------------
  // Eliminación
  // ---------------------------------------------------------------------

  async deleteBackup(id: string, options: DeleteBackupOptions = {}): Promise<void> {
    return this.withLock(`backup:${id}`, async () => {
      const record = this.registry.require(id);
      const dependents = this.registry.getDependentIncrementals(id);
      if (dependents.length > 0 && !options.force) {
        throw createBackupError({
          code: BackupErrorCode.BACKUP_DELETE_BLOCKED,
          message: `El backup "${id}" es base de otros backups incrementales: ${dependents.join(", ")}.`,
          origin: "chain",
          recoverable: true,
        });
      }
      if (
        record.state === "preparing" ||
        record.state === "running" ||
        record.state === "verifying"
      ) {
        throw createBackupError({
          code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
          message: `El backup "${id}" está en curso y no puede eliminarse todavía.`,
          origin: "lifecycle",
          recoverable: true,
        });
      }

      await this.notify("delete.started", id);
      this.registry.setState(id, "deleting");
      try {
        const provider = this.requireProvider(record.manifest.providerId);
        await provider.delete(record.manifest.target, id);
        await this.store.delete(id);
        this.registry.setState(id, "deleted");
        this.registry.unregister(id);
        await this.notify("deleted", id);
      } catch (err) {
        this.trySetState(id, "failed");
        throw BackupError.wrap(err, {
          code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
          origin: "provider",
          recoverable: true,
          message: `Fallo al eliminar el backup "${id}".`,
        });
      }
    });
  }

  // ---------------------------------------------------------------------
  // Retención
  // ---------------------------------------------------------------------

  async applyRetentionPolicy(
    policy: RetentionPolicy,
    options: ApplyRetentionOptions = {}
  ): Promise<RetentionResult> {
    validateRetentionPolicy(policy);
    return this.withLock(`retention:${policy.id}`, async () => {
      await this.notify("retention.evaluated", policy.id);

      const eligible = this.registry.list().filter((id) => {
        const record = this.registry.require(id);
        return (
          (record.state === "completed" || record.state === "completed_with_warnings") &&
          !record.policy.protected
        );
      });

      const toKeep = new Set<string>();

      if (policy.keepForDays !== undefined) {
        const cutoff = Date.now() - policy.keepForDays * 24 * 60 * 60 * 1000;
        for (const id of eligible) {
          if (new Date(this.registry.require(id).manifest.createdAt).getTime() >= cutoff)
            toKeep.add(id);
        }
      }
      if (policy.keepLast !== undefined) {
        const groups: Record<string, string[]> = {};
        for (const id of eligible) {
          const key = policy.perType ? this.registry.require(id).manifest.type : "all";
          (groups[key] ??= []).push(id);
        }
        for (const ids of Object.values(groups)) {
          const sorted = [...ids].sort((a, b) =>
            this.registry
              .require(b)
              .manifest.createdAt.localeCompare(this.registry.require(a).manifest.createdAt)
          );
          for (const id of sorted.slice(0, policy.keepLast)) toKeep.add(id);
        }
      }

      for (const id of [...toKeep]) {
        const baseId = this.registry.require(id).manifest.baseBackupId;
        if (baseId && this.registry.has(baseId)) toKeep.add(baseId);
      }

      const candidates = eligible.filter((id) => !toKeep.has(id));
      const toDelete = candidates.filter((id) =>
        this.registry.getDependentIncrementals(id).every((depId) => candidates.includes(depId))
      );
      const kept = this.registry.list().filter((id) => !toDelete.includes(id));

      if (!options.dryRun) {
        for (const id of toDelete) {
          await this.deleteBackup(id, { force: true }).catch(() => {});
        }
        await this.notify("retention.applied", policy.id);
      }

      return { toDelete, kept };
    });
  }

  // ---------------------------------------------------------------------
  // Programación
  // ---------------------------------------------------------------------

  scheduleBackup(scheduleId: string, request: BackupRequest, intervalMs: number): void {
    if (this.scheduledTasks.has(scheduleId)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
        message: `Ya existe una programación de backup con id "${scheduleId}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    if (!this.scheduler) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
        message: "No hay ningún Scheduler integrado para programar backups.",
        origin: "lifecycle",
        recoverable: false,
      });
    }
    const handle = this.scheduler.schedule(
      () =>
        this.createBackup(request)
          .then(() => undefined)
          .catch(() => undefined),
      { id: `backup-schedule-${scheduleId}`, intervalMs }
    );
    this.scheduledTasks.set(scheduleId, handle);
  }

  /** No elimina automáticamente los backups ya creados por la programación. */
  unscheduleBackup(scheduleId: string): void {
    const handle = this.scheduledTasks.get(scheduleId);
    if (!handle) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_NOT_FOUND,
        message: `No existe ninguna programación de backup con id "${scheduleId}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    handle.cancel();
    this.scheduledTasks.delete(scheduleId);
  }

  // ---------------------------------------------------------------------
  // Persistencia
  // ---------------------------------------------------------------------

  async loadFromPersistence(): Promise<string[]> {
    const ids = await this.store.listIds();
    const restored: string[] = [];
    for (const id of ids) {
      if (this.registry.has(id)) continue;
      const persisted = await this.store.read(id);
      if (!persisted) continue;
      this.registry.register(persisted.manifest, persisted.state, persisted.policy);
      if (persisted.progress) this.registry.setProgress(id, persisted.progress);
      for (const warning of persisted.warnings) this.registry.addWarning(id, warning);
      for (const error of persisted.errors) this.registry.addError(id, error);
      restored.push(id);
    }
    return restored;
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("backup-manager", { backups: this.registry.list() });
    }

    if (this.scheduler && this.retentionCheckIntervalMs && this.defaultRetentionPolicy) {
      const policy = this.defaultRetentionPolicy;
      this.retentionTaskHandle = this.scheduler.schedule(
        () =>
          this.applyRetentionPolicy(policy)
            .then(() => undefined)
            .catch(() => undefined),
        { id: RETENTION_TASK_ID, intervalMs: this.retentionCheckIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "backup-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.retentionTaskHandle?.cancel();
    for (const handle of this.scheduledTasks.values()) handle.cancel();
    this.scheduledTasks.clear();
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private requireProvider(providerId: string): BackupProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INVALID_TARGET,
        message: `No existe ningún proveedor de almacenamiento registrado con id "${providerId}".`,
        origin: "target",
        recoverable: true,
      });
    }
    return provider;
  }

  private toResult(id: string): BackupResult {
    const record = this.registry.require(id);
    return { backupId: id, state: record.state, warnings: record.warnings, errors: record.errors };
  }

  private trySetState(id: string, state: Parameters<BackupRegistry["setState"]>[1]): void {
    try {
      this.registry.setState(id, state);
    } catch {
      // Se ignora: la transición ya pudo haberse aplicado por otra vía.
    }
  }

  private async persist(id: string): Promise<void> {
    const record = this.registry.require(id);
    const persisted: PersistedBackup = {
      manifest: record.manifest,
      state: record.state,
      policy: record.policy,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.progress ? { progress: record.progress } : {}),
    };
    await this.store.write(persisted);
  }

  private async notify(phase: BackupEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `backup.${phase}`,
        { backupId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "failed") {
        await logger.error(`backup:${phase} ${correlationId}`);
      } else {
        await logger.info(`backup:${phase} ${correlationId}`);
      }
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(key)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
        message: `Ya hay una operación en curso para "${key}".`,
        origin: "concurrency",
        recoverable: true,
      });
    }
    this.busy.add(key);
    try {
      return await fn();
    } finally {
      this.busy.delete(key);
    }
  }
}

export type { BackupIssue };
