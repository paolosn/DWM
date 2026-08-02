import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import {
  BackupManager,
  BACKUP_FORMAT_VERSION,
  type BackupProvider,
  type BackupManifest,
  type BackupResource,
  type BackupIssue,
} from "@dwm/backup";
import type { RestoreTargetResolver } from "./RestoreTargetResolver.js";
import { ManagedRestoreTargetResolver } from "./RestoreTargetResolver.js";
import { RestoreRegistry, type RestoreFilter } from "./RestoreRegistry.js";
import { RestoreStore, type PersistedRestore } from "./RestoreStore.js";
import { RestoreValidator } from "./RestoreValidator.js";
import type { RestoreRequest } from "./RestoreRequest.js";
import type { RestoreResult } from "./RestoreResult.js";
import { makeRestoreProgress } from "./RestoreProgress.js";
import type { RestoreDescriptor } from "./RestoreDescriptor.js";
import { isTerminalRestoreState } from "./RestoreState.js";
import { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
import { RestoreError, createRestoreError } from "./errors/RestoreError.js";

export interface RestoreManagerOptions {
  readonly historyDir: string;
  readonly backupManager: BackupManager;
  readonly providers: readonly BackupProvider[];
  readonly targetResolver?: RestoreTargetResolver;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  readonly protectedNamespaces?: readonly string[];
}

type RestoreEventPhase =
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
  | "rolled_back";

interface AppliedItem {
  readonly resource: BackupResource;
  readonly previousValue: unknown;
}

function parseResourceKey(key: string): BackupResource {
  const separatorIndex = key.indexOf(":");
  return {
    resourceType: key.slice(0, separatorIndex) as BackupResource["resourceType"],
    resourceId: key.slice(separatorIndex + 1),
  };
}

/**
 * Sistema de restauración del sistema DWM. Implementa `IModule` (ADR-002
 * §3): se registra en el Core mediante `registerModule`, recibe únicamente
 * el `ModuleContext` mínimo. Reutiliza íntegramente la infraestructura de
 * `@dwm/backup` (catálogo, proveedores, verificación de integridad) en
 * lugar de duplicarla, y nunca declara una restauración completada si
 * quedó parcialmente aplicada: ante cualquier fallo, revierte lógicamente
 * lo ya aplicado.
 */
export class RestoreManager implements IModule {
  readonly id = "restore-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new RestoreRegistry();
  private readonly store: RestoreStore;
  private readonly validator = new RestoreValidator();
  private readonly targetResolver: RestoreTargetResolver;
  private readonly providers = new Map<string, BackupProvider>();
  private readonly backupManager: BackupManager;
  private readonly busy = new Set<string>();
  private readonly cancelFlags = new Set<string>();

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;

  constructor(options: RestoreManagerOptions) {
    if (!options || typeof options.historyDir !== "string" || options.historyDir.length === 0) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
        message: "RestoreManagerOptions.historyDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    if (!options.backupManager) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
        message: "RestoreManagerOptions.backupManager es obligatorio.",
        origin: "request",
        recoverable: false,
      });
    }
    if (!Array.isArray(options.providers) || options.providers.length === 0) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
        message: "RestoreManagerOptions.providers debe incluir al menos un BackupProvider.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new RestoreStore(options.historyDir);
    this.backupManager = options.backupManager;
    for (const provider of options.providers) this.providers.set(provider.id, provider);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;

    this.targetResolver =
      options.targetResolver ??
      new ManagedRestoreTargetResolver({
        ...(options.configManager ? { configManager: options.configManager } : {}),
        ...(options.secretsManager ? { secretsManager: options.secretsManager } : {}),
        ...(options.workspaceManager ? { workspaceManager: options.workspaceManager } : {}),
        ...(options.profileManager ? { profileManager: options.profileManager } : {}),
        ...(options.projectManager ? { projectManager: options.projectManager } : {}),
        ...(options.pluginManager ? { pluginManager: options.pluginManager } : {}),
        ...(options.protectedNamespaces
          ? { protectedNamespaces: options.protectedNamespaces }
          : {}),
      });
  }

  // ---------------------------------------------------------------------
  // Restauración
  // ---------------------------------------------------------------------

  async restoreBackup(request: RestoreRequest): Promise<RestoreResult> {
    this.validator.assertValidRequest(request);
    const lockKey = `restore:${request.backupId}`;

    return this.withLock(lockKey, async () => {
      const restoreId = randomUUID();
      this.registry.register(restoreId, request);
      await this.notify("requested", restoreId);

      try {
        return await this.runRestore(restoreId, request);
      } catch (err) {
        const wrapped = RestoreError.wrap(err, {
          code: RestoreErrorCode.RESTORE_APPLY_FAILED,
          origin: "lifecycle",
          recoverable: true,
        });
        const record = this.registry.get(restoreId);
        if (record && !isTerminalRestoreState(record.state)) {
          this.registry.addError(restoreId, { code: wrapped.code, message: wrapped.message });
          this.trySetState(restoreId, "failed");
          await this.persist(restoreId).catch(() => {});
          await this.notify("failed", restoreId);
        }
        throw wrapped;
      } finally {
        this.cancelFlags.delete(restoreId);
      }
    });
  }

  private async runRestore(restoreId: string, request: RestoreRequest): Promise<RestoreResult> {
    this.registry.setState(restoreId, "preparing");
    this.registry.setStartedAt(restoreId, new Date().toISOString());
    await this.notify("preparing.started", restoreId);

    const backupDescriptor = this.backupManager.getBackup(request.backupId);
    if (!backupDescriptor) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_BACKUP_NOT_FOUND,
        message: `No existe ningún backup con id "${request.backupId}".`,
        origin: "backup",
        recoverable: true,
      });
    }

    const integrity = await this.backupManager.verifyIntegrity(request.backupId);
    if (integrity.status === "invalid" || integrity.status === "unverifiable") {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_BACKUP_CORRUPTED,
        message: `El backup "${request.backupId}" no es íntegro (${integrity.status}): ${integrity.issues.join("; ")}`,
        origin: "backup",
        recoverable: true,
      });
    }

    if (backupDescriptor.manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INCOMPATIBLE_FORMAT,
        message: `El backup "${request.backupId}" usa un formato incompatible ("${backupDescriptor.manifest.formatVersion}").`,
        origin: "backup",
        recoverable: true,
      });
    }

    const { items } = await this.loadChainItems(request.backupId);

    const entries = Object.entries(items).filter(([key]) => {
      if (!request.resourceTypes) return true;
      const resource = parseResourceKey(key);
      return request.resourceTypes.includes(resource.resourceType);
    });

    this.registry.setState(restoreId, "restoring");
    await this.notify("started", restoreId);

    const applied: AppliedItem[] = [];
    let itemsProcessed = 0;

    try {
      for (const [key, snapshot] of entries) {
        if (this.cancelFlags.has(restoreId)) {
          await this.finalizeCancelled(restoreId, applied);
          return this.toResult(restoreId, request);
        }
        const resource = parseResourceKey(key);

        if (request.dryRun) {
          itemsProcessed += 1;
        } else {
          const applyResult = await this.targetResolver.apply(resource, snapshot, {
            allowOverwriteProtected: request.allowOverwriteProtected ?? false,
          });
          if (applyResult.applied) {
            applied.push({ resource, previousValue: applyResult.previousValue });
            itemsProcessed += 1;
          } else if (applyResult.warning) {
            this.registry.addWarning(restoreId, {
              code: RestoreErrorCode.RESTORE_APPLY_FAILED,
              message: applyResult.warning,
            });
          }
        }

        this.registry.setItemsRestored(restoreId, itemsProcessed);
        this.registry.setProgress(
          restoreId,
          makeRestoreProgress("restoring", itemsProcessed, {
            itemsTotal: entries.length,
            currentResource: key,
          })
        );
        await this.notify("progress.updated", restoreId);
      }
    } catch (err) {
      await this.rollback(applied);
      throw err;
    }

    if (this.cancelFlags.has(restoreId)) {
      await this.finalizeCancelled(restoreId, applied);
      return this.toResult(restoreId, request);
    }

    this.registry.setState(restoreId, "verifying");
    await this.notify("verification.started", restoreId);
    await this.notify("verification.completed", restoreId);

    const hasWarnings = this.registry.require(restoreId).warnings.length > 0;
    this.registry.setState(restoreId, hasWarnings ? "completed_with_warnings" : "completed");
    this.registry.setCompletedAt(restoreId, new Date().toISOString());
    await this.persist(restoreId);
    await this.notify(hasWarnings ? "completed.with_warnings" : "completed", restoreId);

    return this.toResult(restoreId, request);
  }

  private async rollback(applied: readonly AppliedItem[]): Promise<void> {
    for (const item of [...applied].reverse()) {
      await this.targetResolver.rollback(item.resource, item.previousValue).catch(() => {});
    }
  }

  private async finalizeCancelled(
    restoreId: string,
    applied: readonly AppliedItem[]
  ): Promise<void> {
    await this.notify("cancellation.requested", restoreId);
    await this.rollback(applied);
    this.trySetState(restoreId, "cancelling");
    this.trySetState(restoreId, "cancelled");
    this.trySetState(restoreId, "rolled_back");
    await this.persist(restoreId).catch(() => {});
    await this.notify("cancelled", restoreId);
    await this.notify("rolled_back", restoreId);
  }

  async cancelRestore(id: string): Promise<void> {
    const record = this.registry.require(id);
    if (record.state === "cancelled" || record.state === "rolled_back") return;
    if (isTerminalRestoreState(record.state)) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_CANCELLATION_NOT_ALLOWED,
        message: `La restauración "${id}" ya finalizó ("${record.state}") y no puede cancelarse.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }

    this.cancelFlags.add(id);

    if (record.state === "pending") {
      await this.notify("cancellation.requested", id);
      this.registry.setState(id, "cancelling");
      this.registry.setState(id, "cancelled");
      this.registry.setState(id, "rolled_back");
      await this.persist(id);
      await this.notify("cancelled", id);
      await this.notify("rolled_back", id);
      return;
    }

    await this.notify("cancellation.requested", id);
  }

  // ---------------------------------------------------------------------
  // Consulta e historial
  // ---------------------------------------------------------------------

  getRestore(id: string): RestoreDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listRestores(): string[] {
    return this.registry.list();
  }

  filterRestores(criteria: RestoreFilter): string[] {
    return this.registry.filter(criteria);
  }

  async loadFromPersistence(): Promise<string[]> {
    const ids = await this.store.listIds();
    const restored: string[] = [];
    for (const id of ids) {
      if (this.registry.has(id)) continue;
      const persisted = await this.store.read(id);
      if (!persisted) continue;
      this.registry.register(id, persisted.request);
      const record = this.registry.require(id);
      record.state = persisted.state;
      record.itemsRestored = persisted.itemsRestored;
      if (persisted.startedAt) record.startedAt = persisted.startedAt;
      if (persisted.completedAt) record.completedAt = persisted.completedAt;
      if (persisted.progress) record.progress = persisted.progress;
      for (const warning of persisted.warnings) record.warnings.push(warning);
      for (const error of persisted.errors) record.errors.push(error);
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
      await this.configManager.setSection("restore-manager", { restores: this.registry.list() });
    }

    context.reportStatus(SystemStatus.OK, "restore-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async loadChainItems(
    backupId: string
  ): Promise<{ chain: readonly BackupManifest[]; items: Record<string, unknown> }> {
    const chain: BackupManifest[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = backupId;

    while (currentId) {
      if (visited.has(currentId)) {
        throw createRestoreError({
          code: RestoreErrorCode.RESTORE_INVALID_CHAIN,
          message: `Se detectó un ciclo en la cadena incremental que involucra a "${currentId}".`,
          origin: "chain",
          recoverable: true,
        });
      }
      visited.add(currentId);

      const descriptor = this.backupManager.getBackup(currentId);
      if (!descriptor) {
        throw createRestoreError({
          code: RestoreErrorCode.RESTORE_INVALID_CHAIN,
          message: `El backup base "${currentId}" de la cadena incremental no existe.`,
          origin: "chain",
          recoverable: true,
        });
      }

      if (currentId !== backupId) {
        const baseIntegrity = await this.backupManager.verifyIntegrity(currentId);
        if (baseIntegrity.status === "invalid" || baseIntegrity.status === "unverifiable") {
          throw createRestoreError({
            code: RestoreErrorCode.RESTORE_INVALID_CHAIN,
            message: `El backup base "${currentId}" de la cadena incremental no es íntegro.`,
            origin: "chain",
            recoverable: true,
          });
        }
      }

      chain.unshift(descriptor.manifest);
      currentId = descriptor.manifest.baseBackupId;
    }

    const items: Record<string, unknown> = {};
    for (const manifest of chain) {
      const provider = this.requireProvider(manifest.providerId);
      const content = await provider.read(manifest.target, manifest.id);
      if (content === undefined) {
        throw createRestoreError({
          code: RestoreErrorCode.RESTORE_BACKUP_CORRUPTED,
          message: `No se pudo leer el contenido del backup "${manifest.id}".`,
          origin: "provider",
          recoverable: true,
        });
      }
      let parsed: { items?: Record<string, unknown> };
      try {
        parsed = JSON.parse(content) as { items?: Record<string, unknown> };
      } catch (err) {
        throw RestoreError.wrap(err, {
          code: RestoreErrorCode.RESTORE_BACKUP_CORRUPTED,
          origin: "backup",
          recoverable: true,
          message: `El contenido del backup "${manifest.id}" no es JSON válido.`,
        });
      }
      Object.assign(items, parsed.items ?? {});
    }

    return { chain, items };
  }

  private requireProvider(providerId: string): BackupProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_TARGET,
        message: `No existe ningún proveedor de almacenamiento registrado con id "${providerId}".`,
        origin: "target",
        recoverable: true,
      });
    }
    return provider;
  }

  private toResult(restoreId: string, request: RestoreRequest): RestoreResult {
    const record = this.registry.require(restoreId);
    return {
      restoreId,
      backupId: request.backupId,
      state: record.state,
      dryRun: request.dryRun ?? false,
      itemsRestored: record.itemsRestored,
      warnings: record.warnings,
      errors: record.errors,
    };
  }

  private trySetState(id: string, state: Parameters<RestoreRegistry["setState"]>[1]): void {
    try {
      this.registry.setState(id, state);
    } catch {
      // Se ignora: la transición ya pudo haberse aplicado por otra vía.
    }
  }

  private async persist(id: string): Promise<void> {
    const record = this.registry.require(id);
    const persisted: PersistedRestore = {
      restoreId: record.restoreId,
      request: record.request,
      createdAt: record.createdAt,
      state: record.state,
      itemsRestored: record.itemsRestored,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.progress ? { progress: record.progress } : {}),
    };
    await this.store.write(persisted);
  }

  private async notify(phase: RestoreEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `restore.${phase}`,
        { restoreId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "failed") {
        await logger.error(`restore:${phase} ${correlationId}`);
      } else {
        await logger.info(`restore:${phase} ${correlationId}`);
      }
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(key)) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_OPERATION_CONFLICT,
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
