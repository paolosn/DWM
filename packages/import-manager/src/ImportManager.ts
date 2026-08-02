import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { ImportScanner } from "./ImportScanner.js";
import { ImportValidator } from "./ImportValidator.js";
import { ImportService } from "./ImportService.js";
import { ImportRegistry, type ImportFilter } from "./ImportRegistry.js";
import { ImportStore, type PersistedImport } from "./ImportStore.js";
import type { ImportRequest, ImportScanResult } from "./ImportTypes.js";
import type { ImportResult } from "./ImportResult.js";
import type { ImportDescriptor } from "./ImportDescriptor.js";
import { makeImportProgress } from "./ImportProgress.js";
import { isTerminalImportState } from "./ImportState.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { ImportError, createImportError } from "./errors/ImportError.js";

export interface ImportManagerOptions {
  readonly historyDir: string;
  readonly scanner?: ImportScanner;
  readonly validator?: ImportValidator;
  readonly service?: ImportService;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
  readonly verificationManager?: VerificationManager;
}

type ImportEventPhase =
  | "requested"
  | "scanning.started"
  | "scanning.completed"
  | "validating.started"
  | "copying.started"
  | "progress.updated"
  | "verifying.started"
  | "verifying.completed"
  | "completed"
  | "completed.with_warnings"
  | "cancellation.requested"
  | "cancelled"
  | "failed"
  | "rolled_back";

/**
 * Módulo 21 — Import Manager. Responsable exclusivo de importar
 * físicamente un origen (carpeta, ZIP, o Workspace DWM anterior completo)
 * al Workspace portable de DWM: copia todo —incluidos ficheros ocultos,
 * `.kilo`, agentes, skills, reglas, conocimiento, proyectos, clientes,
 * auditorías, scripts y configuraciones—, valida la integridad de la
 * copia y nunca deja un Workspace parcialmente importado. No interpreta,
 * clasifica, indexa ni analiza el contenido importado: eso es
 * responsabilidad del siguiente módulo (PSN Adapter). Implementa
 * `IModule`, integrándose con el resto del Engine únicamente a través de
 * sus APIs públicas.
 */
export class ImportManager implements IModule {
  readonly id = "import-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new ImportRegistry();
  private readonly store: ImportStore;
  private readonly scanner: ImportScanner;
  private readonly validator: ImportValidator;
  private readonly service: ImportService;
  private readonly busy = new Set<string>();
  private readonly cancelFlags = new Set<string>();

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly backupManager?: BackupManager;
  private readonly restoreManager?: RestoreManager;
  private readonly migrationManager?: MigrationManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: ImportManagerOptions) {
    if (!options || typeof options.historyDir !== "string" || options.historyDir.length === 0) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_INVALID_REQUEST,
        message: "ImportManagerOptions.historyDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new ImportStore(options.historyDir);
    this.scanner = options.scanner ?? new ImportScanner();
    this.validator = options.validator ?? new ImportValidator();
    this.service = options.service ?? new ImportService();

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.backupManager) this.backupManager = options.backupManager;
    if (options.restoreManager) this.restoreManager = options.restoreManager;
    if (options.migrationManager) this.migrationManager = options.migrationManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Importación
  // ---------------------------------------------------------------------

  async importSource(request: ImportRequest): Promise<ImportResult> {
    this.validator.assertValidRequest(request);
    const destinationPath = this.resolveDestination(request);
    const lockKey = `import:${destinationPath}`;

    return this.withLock(lockKey, async () => {
      const importId = randomUUID();
      this.registry.register(importId, request);
      this.registry.setDestinationPath(importId, destinationPath);
      await this.notify("requested", importId);

      try {
        return await this.runImport(importId, request, destinationPath);
      } catch (err) {
        const wrapped = ImportError.wrap(err, {
          code: ImportErrorCode.IMPORT_COPY_FAILED,
          origin: "lifecycle",
          recoverable: true,
        });
        const record = this.registry.get(importId);
        if (record && !isTerminalImportState(record.state)) {
          this.registry.addError(importId, { code: wrapped.code, message: wrapped.message });
          this.trySetState(importId, "failed");
          await this.persist(importId).catch(() => {});
          await this.notify("failed", importId);
        }
        throw wrapped;
      } finally {
        this.cancelFlags.delete(importId);
      }
    });
  }

  private async runImport(
    importId: string,
    request: ImportRequest,
    destinationPath: string
  ): Promise<ImportResult> {
    if (!request.overwriteExisting && (await this.service.destinationExists(destinationPath))) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_DESTINATION_EXISTS,
        message: `El destino "${destinationPath}" ya existe; indica overwriteExisting para sustituirlo.`,
        origin: "destination",
        recoverable: true,
      });
    }

    this.registry.setState(importId, "scanning");
    this.registry.setStartedAt(importId, new Date().toISOString());
    await this.notify("scanning.started", importId);

    const sourceScan = await this.scanner.scan(
      request.sourceType,
      request.sourcePath,
      request.excludePatterns ?? []
    );
    await this.notify("scanning.completed", importId);

    if (this.cancelFlags.has(importId)) return this.finalizeCancelled(importId, request);

    this.registry.setState(importId, "validating");
    await this.notify("validating.started", importId);
    // Valida la forma de la solicitud una segunda vez junto al resultado del
    // escaneo (defensivo: el escaneo pudo tardar y las condiciones cambiar).
    this.validator.assertValidRequest(request);

    if (this.cancelFlags.has(importId)) return this.finalizeCancelled(importId, request);

    this.registry.setState(importId, "copying");
    await this.notify("copying.started", importId);

    const stagingBaseDir = path.dirname(destinationPath);
    const stagingDir = this.service.createStagingDir(stagingBaseDir);

    const copyResult = await this.service.copyToStaging(
      request.sourceType,
      request.sourcePath,
      sourceScan,
      stagingDir,
      {
        dryRun: request.dryRun ?? false,
        onProgress: async (update) => {
          this.registry.setFilesImported(importId, update.itemsProcessed);
          this.registry.setProgress(
            importId,
            makeImportProgress("copying", update.itemsProcessed, {
              itemsTotal: update.itemsTotal,
              currentEntry: update.currentEntry,
            })
          );
          await this.notify("progress.updated", importId);
        },
      }
    );
    this.registry.setDirectoriesImported(importId, copyResult.directoriesCopied);

    if (this.cancelFlags.has(importId)) {
      await this.service.rollbackStaging(stagingDir).catch(() => {});
      return this.finalizeCancelled(importId, request);
    }

    this.registry.setState(importId, "verifying");
    await this.notify("verifying.started", importId);

    let integrityIssues = 0;
    if (!request.dryRun) {
      const stagedScan = await this.scanner.scanFolder(stagingDir, []);
      const integrity = this.validator.validateIntegrity(sourceScan, stagedScan);
      if (!integrity.valid) {
        await this.service.rollbackStaging(stagingDir).catch(() => {});
        throw createImportError({
          code: ImportErrorCode.IMPORT_INTEGRITY_MISMATCH,
          message: `La importación no es íntegra: ${integrity.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
          origin: "validation",
          recoverable: true,
        });
      }
      await this.service.commitStaging(
        stagingDir,
        destinationPath,
        request.overwriteExisting ?? false
      );
    } else {
      await this.service.rollbackStaging(stagingDir).catch(() => {});
    }
    await this.notify("verifying.completed", importId);

    if (this.verificationManager && !request.dryRun) {
      try {
        await this.verificationManager.verify({ dryRun: true });
      } catch (err) {
        integrityIssues += 1;
        this.registry.addWarning(importId, {
          code: ImportErrorCode.IMPORT_VALIDATION_FAILED,
          message: `La verificación posterior a la importación reportó un problema: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    if (this.configManager) {
      await this.configManager.setSection("import-manager", {
        imports: this.registry.list(),
        integrations: this.listConnectedIntegrations(),
      });
    }

    const hasWarnings = this.registry.require(importId).warnings.length > 0 || integrityIssues > 0;
    this.registry.setState(importId, hasWarnings ? "completed_with_warnings" : "completed");
    this.registry.setCompletedAt(importId, new Date().toISOString());
    await this.persist(importId);
    await this.notify(hasWarnings ? "completed.with_warnings" : "completed", importId);

    return this.toResult(importId, request, destinationPath);
  }

  private async finalizeCancelled(importId: string, request: ImportRequest): Promise<ImportResult> {
    await this.notify("cancellation.requested", importId);
    this.trySetState(importId, "cancelling");
    this.trySetState(importId, "cancelled");
    this.trySetState(importId, "rolled_back");
    await this.persist(importId).catch(() => {});
    await this.notify("cancelled", importId);
    await this.notify("rolled_back", importId);
    const record = this.registry.require(importId);
    return this.toResult(importId, request, record.destinationPath ?? "");
  }

  async cancelImport(id: string): Promise<void> {
    const record = this.registry.require(id);
    if (record.state === "cancelled" || record.state === "rolled_back") return;
    if (isTerminalImportState(record.state)) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_CANCELLATION_NOT_ALLOWED,
        message: `La importación "${id}" ya finalizó ("${record.state}") y no puede cancelarse.`,
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

  getImport(id: string): ImportDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listImports(): string[] {
    return this.registry.list();
  }

  filterImports(criteria: ImportFilter): string[] {
    return this.registry.filter(criteria);
  }

  async scanSource(request: ImportRequest): Promise<ImportScanResult> {
    this.validator.assertValidRequest(request);
    return this.scanner.scan(request.sourceType, request.sourcePath, request.excludePatterns ?? []);
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
      record.filesImported = persisted.filesImported;
      record.directoriesImported = persisted.directoriesImported;
      if (persisted.startedAt) record.startedAt = persisted.startedAt;
      if (persisted.completedAt) record.completedAt = persisted.completedAt;
      if (persisted.destinationPath) record.destinationPath = persisted.destinationPath;
      if (persisted.progress) record.progress = persisted.progress;
      for (const warning of persisted.warnings) record.warnings.push(warning);
      for (const error of persisted.errors) record.errors.push(error);
      restored.push(id);
    }
    return restored;
  }

  // ---------------------------------------------------------------------
  // Integraciones
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspacePaths) connected.push("portable-workspace");
    if (this.workspaceManager) connected.push("workspace");
    if (this.configManager) connected.push("config");
    if (this.backupManager) connected.push("backup");
    if (this.restoreManager) connected.push("restore");
    if (this.migrationManager) connected.push("migration");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "import-manager",
      getStatus: () => {
        const failedCount = this.registry.filter({ state: "failed" }).length;
        if (failedCount > 0) {
          return makeStatusReport(
            "import-manager",
            "WARNING",
            `Hay ${failedCount} importación(es) fallida(s) en el historial.`,
            { failedCount }
          );
        }
        return makeStatusReport("import-manager", "OK", "import-manager responde correctamente.");
      },
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("import-manager", {
        imports: this.registry.list(),
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "import-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private resolveDestination(request: ImportRequest): string {
    if (request.destinationPath) return request.destinationPath;

    if (this.workspacePaths) {
      if (request.destinationRelativePath) {
        return path.join(this.workspacePaths.root, request.destinationRelativePath);
      }
      if (request.sourceType === "dwm-workspace") {
        return this.workspacePaths.sistemaDeTrabajo;
      }
      const baseName = path.basename(request.sourcePath).replace(/\.zip$/i, "");
      return path.join(this.workspacePaths.workspace, baseName);
    }

    if (request.destinationRelativePath) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_DESTINATION_UNRESOLVABLE,
        message:
          "destinationRelativePath requiere WorkspacePaths para resolverse; indica destinationPath en su lugar.",
        origin: "destination",
        recoverable: true,
      });
    }

    throw createImportError({
      code: ImportErrorCode.IMPORT_DESTINATION_UNRESOLVABLE,
      message:
        "No se pudo resolver un destino: indica destinationPath, destinationRelativePath con WorkspacePaths, o configura ImportManagerOptions.workspacePaths.",
      origin: "destination",
      recoverable: true,
    });
  }

  private toResult(
    importId: string,
    request: ImportRequest,
    destinationPath: string
  ): ImportResult {
    const record = this.registry.require(importId);
    return {
      importId,
      state: record.state,
      dryRun: request.dryRun ?? false,
      sourceType: request.sourceType,
      sourcePath: request.sourcePath,
      destinationPath,
      filesImported: record.filesImported,
      directoriesImported: record.directoriesImported,
      warnings: record.warnings,
      errors: record.errors,
    };
  }

  private trySetState(id: string, state: Parameters<ImportRegistry["setState"]>[1]): void {
    try {
      this.registry.setState(id, state);
    } catch {
      // Se ignora: la transición ya pudo haberse aplicado por otra vía.
    }
  }

  private async persist(id: string): Promise<void> {
    const record = this.registry.require(id);
    const persisted: PersistedImport = {
      importId: record.importId,
      request: record.request,
      createdAt: record.createdAt,
      state: record.state,
      filesImported: record.filesImported,
      directoriesImported: record.directoriesImported,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.destinationPath ? { destinationPath: record.destinationPath } : {}),
      ...(record.progress ? { progress: record.progress } : {}),
    };
    await this.store.write(persisted);
  }

  private async notify(phase: ImportEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `import.${phase}`,
        { importId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "failed") {
        await logger.error(`import:${phase} ${correlationId}`);
      } else {
        await logger.info(`import:${phase} ${correlationId}`);
      }
    }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(key)) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_OPERATION_CONFLICT,
        message: `Ya hay una operación de importación en curso para "${key}".`,
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
