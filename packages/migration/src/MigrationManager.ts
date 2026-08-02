import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import { BackupManager, type BackupState } from "@dwm/backup";
import { RestoreManager, type RestoreState } from "@dwm/restore";
import { MigrationConflictDetector } from "./MigrationConflict.js";
import {
  MigrationRegistry,
  type MigrationFilter,
  type MigrationRecord,
} from "./MigrationRegistry.js";
import { MigrationStore, type PersistedMigration } from "./MigrationStore.js";
import { MigrationValidator } from "./MigrationValidator.js";
import type { MigrationExportRequest, MigrationImportRequest } from "./MigrationRequest.js";
import type { MigrationResult } from "./MigrationResult.js";
import type { MigrationDescriptor } from "./MigrationDescriptor.js";
import { isTerminalMigrationState, type MigrationState } from "./MigrationState.js";
import { MigrationErrorCode } from "./errors/MigrationErrorCode.js";
import { MigrationError, createMigrationError } from "./errors/MigrationError.js";

export interface MigrationManagerOptions {
  readonly historyDir: string;
  readonly backupManager: BackupManager;
  readonly restoreManager: RestoreManager;
  readonly dwmVersion: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
}

type MigrationEventPhase =
  | "requested"
  | "preparing.started"
  | "started"
  | "completed"
  | "completed.with_warnings"
  | "cancelled"
  | "rolled_back"
  | "failed";

/**
 * Sistema de migración del sistema DWM. Implementa `IModule` (ADR-002 §3):
 * se registra en el Core mediante `registerModule`, recibe únicamente el
 * `ModuleContext` mínimo. Reutiliza íntegramente `@dwm/backup` (para la
 * exportación) y `@dwm/restore` (para la importación, con toda su
 * verificación de integridad y rollback lógico ya implementados) en lugar
 * de duplicar esa lógica; añade únicamente lo específico de una migración
 * entre instalaciones: compatibilidad de versión de origen, detección de
 * conflictos y su propio historial.
 */
export class MigrationManager implements IModule {
  readonly id = "migration-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new MigrationRegistry();
  private readonly store: MigrationStore;
  private readonly validator = new MigrationValidator();
  private readonly conflictDetector: MigrationConflictDetector;
  private readonly backupManager: BackupManager;
  private readonly restoreManager: RestoreManager;
  private readonly dwmVersion: string;
  private readonly busy = new Set<string>();

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;

  constructor(options: MigrationManagerOptions) {
    if (!options || typeof options.historyDir !== "string" || options.historyDir.length === 0) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
        message:
          "MigrationManagerOptions.historyDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    if (!options.backupManager || !options.restoreManager) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
        message: "MigrationManagerOptions.backupManager y restoreManager son obligatorios.",
        origin: "request",
        recoverable: false,
      });
    }
    if (typeof options.dwmVersion !== "string" || options.dwmVersion.length === 0) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
        message:
          "MigrationManagerOptions.dwmVersion es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new MigrationStore(options.historyDir);
    this.backupManager = options.backupManager;
    this.restoreManager = options.restoreManager;
    this.dwmVersion = options.dwmVersion;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;

    this.conflictDetector = new MigrationConflictDetector({
      ...(options.configManager ? { configManager: options.configManager } : {}),
      ...(options.workspaceManager ? { workspaceManager: options.workspaceManager } : {}),
      ...(options.profileManager ? { profileManager: options.profileManager } : {}),
      ...(options.projectManager ? { projectManager: options.projectManager } : {}),
      ...(options.pluginManager ? { pluginManager: options.pluginManager } : {}),
    });
  }

  // ---------------------------------------------------------------------
  // Exportación
  // ---------------------------------------------------------------------

  async exportMigration(request: MigrationExportRequest): Promise<MigrationResult> {
    this.validator.assertValidExportRequest(request);
    const lockKey = `migration-export:${request.target.providerId}:${request.target.path}`;

    return this.withLock(lockKey, async () => {
      const migrationId = randomUUID();
      this.registry.register(migrationId, "export", request);
      await this.notify("requested", migrationId);

      try {
        this.registry.setState(migrationId, "preparing");
        await this.notify("preparing.started", migrationId);
        this.registry.setState(migrationId, "running");
        await this.notify("started", migrationId);

        const backupResult = await this.backupManager.createBackup({
          type: request.type,
          resources: request.resources,
          target: request.target,
          ...(request.excludedPaths ? { excludedPaths: request.excludedPaths } : {}),
          ...(request.baseBackupId ? { baseBackupId: request.baseBackupId } : {}),
        });

        this.registry.setBackupId(migrationId, backupResult.backupId);
        this.registry.setSourceDwmVersion(migrationId, this.dwmVersion);
        for (const warning of backupResult.warnings) this.registry.addWarning(migrationId, warning);
        for (const error of backupResult.errors) this.registry.addError(migrationId, error);

        const migrationState = this.mapBackupState(backupResult.state);
        this.registry.setState(migrationId, migrationState);
        this.registry.setCompletedAt(migrationId, new Date().toISOString());
        await this.persist(migrationId);
        await this.notify(this.eventForState(migrationState), migrationId);

        return this.toResult(migrationId);
      } catch (err) {
        throw await this.handleFailure(
          migrationId,
          err,
          MigrationErrorCode.MIGRATION_EXPORT_FAILED,
          "backup"
        );
      }
    });
  }

  // ---------------------------------------------------------------------
  // Importación
  // ---------------------------------------------------------------------

  async importMigration(request: MigrationImportRequest): Promise<MigrationResult> {
    this.validator.assertValidImportRequest(request);
    const lockKey = `migration-import:${request.backupId}`;

    return this.withLock(lockKey, async () => {
      const backupDescriptor = this.backupManager.getBackup(request.backupId);
      if (!backupDescriptor) {
        throw createMigrationError({
          code: MigrationErrorCode.MIGRATION_BACKUP_NOT_FOUND,
          message: `No existe ningún backup con id "${request.backupId}".`,
          origin: "backup",
          recoverable: true,
        });
      }

      const migrationId = randomUUID();
      this.registry.register(migrationId, "import", request);
      await this.notify("requested", migrationId);

      try {
        this.registry.setState(migrationId, "preparing");
        await this.notify("preparing.started", migrationId);

        const exportRecord = this.findExportRecordByBackupId(request.backupId);
        if (
          exportRecord?.sourceDwmVersion &&
          !this.isVersionCompatible(exportRecord.sourceDwmVersion)
        ) {
          throw createMigrationError({
            code: MigrationErrorCode.MIGRATION_INCOMPATIBLE_VERSION,
            message: `La migración se originó en DWM "${exportRecord.sourceDwmVersion}", incompatible con la versión local "${this.dwmVersion}".`,
            origin: "compatibility",
            recoverable: true,
          });
        }

        let resourceTypes = request.resourceTypes;
        const consideredResources = backupDescriptor.manifest.includedResources.filter(
          (resource) => !resourceTypes || resourceTypes.includes(resource.resourceType)
        );
        const conflicts = await this.conflictDetector.detect(consideredResources);
        if (conflicts.length > 0) {
          const strategy = request.conflictStrategy ?? "fail";
          if (strategy === "fail") {
            throw createMigrationError({
              code: MigrationErrorCode.MIGRATION_CONFLICT,
              message: `Se detectaron ${conflicts.length} conflicto(s): ${conflicts
                .map((c) => `${c.resource.resourceType}:${c.resource.resourceId}`)
                .join(", ")}.`,
              origin: "conflict",
              recoverable: true,
            });
          }
          if (strategy === "skip") {
            const conflictingTypes = new Set(conflicts.map((c) => c.resource.resourceType));
            const allTypes = new Set(
              backupDescriptor.manifest.includedResources.map((r) => r.resourceType)
            );
            resourceTypes = [...allTypes].filter((type) => !conflictingTypes.has(type));
            for (const conflict of conflicts) {
              this.registry.addWarning(migrationId, {
                code: MigrationErrorCode.MIGRATION_CONFLICT,
                message: `Recurso omitido por conflicto: "${conflict.resource.resourceType}:${conflict.resource.resourceId}".`,
              });
            }
          }
        }

        this.registry.setState(migrationId, "running");
        await this.notify("started", migrationId);

        const restoreResult = await this.restoreManager.restoreBackup({
          backupId: request.backupId,
          dryRun: request.dryRun ?? false,
          allowOverwriteProtected: request.allowOverwriteProtected ?? false,
          ...(resourceTypes ? { resourceTypes } : {}),
        });

        this.registry.setRestoreId(migrationId, restoreResult.restoreId);
        for (const warning of restoreResult.warnings)
          this.registry.addWarning(migrationId, warning);
        for (const error of restoreResult.errors) this.registry.addError(migrationId, error);

        let migrationState = this.mapRestoreState(restoreResult.state);
        if (
          migrationState === "completed" &&
          this.registry.require(migrationId).warnings.length > 0
        ) {
          migrationState = "completed_with_warnings";
        }
        this.registry.setState(migrationId, migrationState);
        this.registry.setCompletedAt(migrationId, new Date().toISOString());
        await this.persist(migrationId);
        await this.notify(this.eventForState(migrationState), migrationId);

        return this.toResult(migrationId);
      } catch (err) {
        throw await this.handleFailure(
          migrationId,
          err,
          MigrationErrorCode.MIGRATION_IMPORT_FAILED,
          "restore"
        );
      }
    });
  }

  // ---------------------------------------------------------------------
  // Cancelación
  // ---------------------------------------------------------------------

  async cancelMigration(id: string): Promise<void> {
    const record = this.registry.require(id);
    if (record.state === "cancelled" || record.state === "rolled_back") return;
    if (isTerminalMigrationState(record.state)) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_CANCELLATION_NOT_ALLOWED,
        message: `La migración "${id}" ya finalizó ("${record.state}") y no puede cancelarse.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    if (record.state !== "pending") {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_CANCELLATION_NOT_ALLOWED,
        message: `La migración "${id}" ya está en curso ("${record.state}") y no admite cancelación en esta fase.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }

    this.registry.setState(id, "cancelling");
    this.registry.setState(id, "cancelled");
    await this.persist(id);
    await this.notify("cancelled", id);
  }

  // ---------------------------------------------------------------------
  // Consulta e historial
  // ---------------------------------------------------------------------

  getMigration(id: string): MigrationDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listMigrations(): string[] {
    return this.registry.list();
  }

  filterMigrations(criteria: MigrationFilter): string[] {
    return this.registry.filter(criteria);
  }

  async loadFromPersistence(): Promise<string[]> {
    const ids = await this.store.listIds();
    const restored: string[] = [];
    for (const id of ids) {
      if (this.registry.has(id)) continue;
      const persisted = await this.store.read(id);
      if (!persisted) continue;
      this.registry.register(id, persisted.direction, persisted.request);
      const record = this.registry.require(id);
      record.state = persisted.state;
      if (persisted.completedAt) record.completedAt = persisted.completedAt;
      if (persisted.backupId) record.backupId = persisted.backupId;
      if (persisted.restoreId) record.restoreId = persisted.restoreId;
      if (persisted.sourceDwmVersion) record.sourceDwmVersion = persisted.sourceDwmVersion;
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
      await this.configManager.setSection("migration-manager", {
        migrations: this.registry.list(),
      });
    }

    context.reportStatus(SystemStatus.OK, "migration-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private mapBackupState(state: BackupState): MigrationState {
    if (state === "completed") return "completed";
    if (state === "completed_with_warnings") return "completed_with_warnings";
    if (state === "cancelled") return "cancelled";
    return "failed";
  }

  private mapRestoreState(state: RestoreState): MigrationState {
    if (state === "completed") return "completed";
    if (state === "completed_with_warnings") return "completed_with_warnings";
    if (state === "rolled_back") return "rolled_back";
    return "failed";
  }

  private eventForState(state: MigrationState): MigrationEventPhase {
    if (state === "completed_with_warnings") return "completed.with_warnings";
    if (state === "completed" || state === "cancelled" || state === "rolled_back") return state;
    return "failed";
  }

  private isVersionCompatible(sourceVersion: string): boolean {
    const sourceMajor = Number.parseInt(sourceVersion.split(".")[0] ?? "0", 10);
    const localMajor = Number.parseInt(this.dwmVersion.split(".")[0] ?? "0", 10);
    return sourceMajor === localMajor;
  }

  private findExportRecordByBackupId(backupId: string): MigrationRecord | undefined {
    for (const id of this.registry.list()) {
      const record = this.registry.require(id);
      if (record.direction === "export" && record.backupId === backupId) return record;
    }
    return undefined;
  }

  private async handleFailure(
    migrationId: string,
    err: unknown,
    code: MigrationErrorCode,
    origin: "backup" | "restore"
  ): Promise<MigrationError> {
    const wrapped = MigrationError.wrap(err, { code, origin, recoverable: true });
    const record = this.registry.get(migrationId);
    if (record && !isTerminalMigrationState(record.state)) {
      this.registry.addError(migrationId, { code: wrapped.code, message: wrapped.message });
      this.trySetState(migrationId, "failed");
      await this.persist(migrationId).catch(() => {});
      await this.notify("failed", migrationId);
    }
    return wrapped;
  }

  private trySetState(id: string, state: MigrationState): void {
    try {
      this.registry.setState(id, state);
    } catch {
      // Se ignora: la transición ya pudo haberse aplicado por otra vía.
    }
  }

  private toResult(migrationId: string): MigrationResult {
    const record = this.registry.require(migrationId);
    return {
      migrationId,
      direction: record.direction,
      state: record.state,
      dryRun:
        record.direction === "import" ? !!(record.request as MigrationImportRequest).dryRun : false,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.backupId ? { backupId: record.backupId } : {}),
      ...(record.restoreId ? { restoreId: record.restoreId } : {}),
    };
  }

  private async persist(id: string): Promise<void> {
    const record = this.registry.require(id);
    const persisted: PersistedMigration = {
      migrationId: record.migrationId,
      direction: record.direction,
      request: record.request,
      createdAt: record.createdAt,
      state: record.state,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.backupId ? { backupId: record.backupId } : {}),
      ...(record.restoreId ? { restoreId: record.restoreId } : {}),
      ...(record.sourceDwmVersion ? { sourceDwmVersion: record.sourceDwmVersion } : {}),
    };
    await this.store.write(persisted);
  }

  private async notify(phase: MigrationEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `migration.${phase}`,
        { migrationId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "failed") {
        await logger.error(`migration:${phase} ${correlationId}`);
      } else {
        await logger.info(`migration:${phase} ${correlationId}`);
      }
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(key)) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_OPERATION_CONFLICT,
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
