import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext, DWMCore } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { VerificationManager } from "@dwm/verification";
import { StatusRegistry } from "./StatusRegistry.js";
import { StatusStore } from "./StatusStore.js";
import type {
  GlobalStatusReport,
  StatusLevel,
  StatusProvider,
  StatusReport,
} from "./StatusTypes.js";
import { makeStatusReport, worstStatusLevel } from "./StatusTypes.js";
import {
  makeAIProvider,
  makeBackupProvider,
  makeConfigProvider,
  makeCoreProvider,
  makeMigrationProvider,
  makePluginProvider,
  makeProfileProvider,
  makeProjectProvider,
  makeRestoreProvider,
  makeSecretsProvider,
  makeVerificationProvider,
  makeWorkspaceProvider,
} from "./StatusProviders.js";
import { StatusErrorCode } from "./errors/StatusErrorCode.js";
import { StatusError, createStatusError } from "./errors/StatusError.js";

export interface StatusManagerOptions {
  readonly historyDir: string;
  readonly core?: DWMCore;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
  readonly verificationManager?: VerificationManager;
}

type StatusEventPhase = "snapshot.requested" | "snapshot.created" | "snapshot.failed";

/**
 * Punto central desde el que DWM puede consultar la salud de todo el
 * Engine. Implementa `IModule` (ADR-002 §3): se registra en el Core
 * mediante `registerModule`, recibe únicamente el `ModuleContext` mínimo.
 * Nunca depende de implementaciones internas de otros módulos: cada
 * proveedor de estado integrado consulta exclusivamente la API pública
 * correspondiente. La arquitectura es extensible mediante
 * `registerProvider()`, sin necesidad de modificar esta clase para
 * incorporar módulos futuros.
 */
export class StatusManager implements IModule {
  readonly id = "status-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new StatusRegistry();
  private readonly store: StatusStore;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;

  constructor(options: StatusManagerOptions) {
    if (!options || typeof options.historyDir !== "string" || options.historyDir.length === 0) {
      throw createStatusError({
        code: StatusErrorCode.STATUS_INVALID_REQUEST,
        message: "StatusManagerOptions.historyDir es obligatorio y debe ser una cadena no vacía.",
        origin: "request",
        recoverable: false,
      });
    }
    this.store = new StatusStore(options.historyDir);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;

    this.registry.register(makeCoreProvider(options.core));
    this.registry.register(makeWorkspaceProvider(options.workspaceManager));
    this.registry.register(makeConfigProvider(options.configManager));
    this.registry.register(makeSecretsProvider(options.secretsManager));
    this.registry.register(makeAIProvider(options.aiManager));
    this.registry.register(makeProfileProvider(options.profileManager));
    this.registry.register(makeProjectProvider(options.projectManager));
    this.registry.register(makePluginProvider(options.pluginManager));
    this.registry.register(makeBackupProvider(options.backupManager));
    this.registry.register(makeRestoreProvider(options.restoreManager));
    this.registry.register(makeMigrationProvider(options.migrationManager));
    this.registry.register(makeVerificationProvider(options.verificationManager));
  }

  // ---------------------------------------------------------------------
  // Extensibilidad
  // ---------------------------------------------------------------------

  registerProvider(provider: StatusProvider): void {
    this.registry.register(provider);
  }

  unregisterProvider(id: string): void {
    this.registry.unregister(id);
  }

  listProviders(): string[] {
    return this.registry.list();
  }

  // ---------------------------------------------------------------------
  // Consulta de estado
  // ---------------------------------------------------------------------

  async getModuleStatus(id: string): Promise<StatusReport> {
    const provider = this.registry.require(id);
    try {
      return await provider.getStatus();
    } catch (err) {
      throw StatusError.wrap(err, {
        code: StatusErrorCode.STATUS_PROVIDER_QUERY_FAILED,
        origin: "provider",
        recoverable: true,
        message: `Fallo al consultar el proveedor de estado "${id}".`,
      });
    }
  }

  async getGlobalStatus(): Promise<GlobalStatusReport> {
    const snapshotId = randomUUID();
    await this.notify("snapshot.requested", snapshotId);

    const reports: StatusReport[] = [];
    for (const id of this.registry.list()) {
      try {
        reports.push(await this.registry.require(id).getStatus());
      } catch (err) {
        reports.push(
          makeStatusReport(id, "ERROR", err instanceof Error ? err.message : String(err))
        );
      }
    }

    const level = reports.reduce<StatusLevel>(
      (worst, report) => worstStatusLevel(worst, report.level),
      "OK"
    );
    const snapshot: GlobalStatusReport = {
      snapshotId,
      level,
      generatedAt: new Date().toISOString(),
      reports,
    };

    try {
      await this.store.write(snapshot);
      await this.notify("snapshot.created", snapshotId);
    } catch (err) {
      await this.notify("snapshot.failed", snapshotId);
      throw StatusError.wrap(err, {
        code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir la instantánea de estado "${snapshotId}".`,
      });
    }

    return snapshot;
  }

  // ---------------------------------------------------------------------
  // Accesos directos por módulo (FRS)
  // ---------------------------------------------------------------------

  async getCoreStatus(): Promise<StatusReport> {
    return this.getModuleStatus("core");
  }

  async getWorkspaceStatus(): Promise<StatusReport> {
    return this.getModuleStatus("workspace");
  }

  async getConfigStatus(): Promise<StatusReport> {
    return this.getModuleStatus("config");
  }

  async getSecretsStatus(): Promise<StatusReport> {
    return this.getModuleStatus("secrets");
  }

  async getAIStatus(): Promise<StatusReport> {
    return this.getModuleStatus("ai-manager");
  }

  async getProfileStatus(): Promise<StatusReport> {
    return this.getModuleStatus("profile");
  }

  async getProjectsStatus(): Promise<StatusReport> {
    return this.getModuleStatus("project");
  }

  async getPluginsStatus(): Promise<StatusReport> {
    return this.getModuleStatus("plugin");
  }

  async getBackupsStatus(): Promise<StatusReport> {
    return this.getModuleStatus("backup");
  }

  async getRestoresStatus(): Promise<StatusReport> {
    return this.getModuleStatus("restore");
  }

  async getMigrationsStatus(): Promise<StatusReport> {
    return this.getModuleStatus("migration");
  }

  async getVerificationStatus(): Promise<StatusReport> {
    return this.getModuleStatus("verification");
  }

  // ---------------------------------------------------------------------
  // Instantáneas persistidas
  // ---------------------------------------------------------------------

  async listSnapshots(): Promise<string[]> {
    return this.store.listIds();
  }

  async getSnapshot(id: string): Promise<GlobalStatusReport | undefined> {
    return this.store.read(id);
  }

  async requireSnapshot(id: string): Promise<GlobalStatusReport> {
    const snapshot = await this.store.read(id);
    if (!snapshot) {
      throw createStatusError({
        code: StatusErrorCode.STATUS_SNAPSHOT_NOT_FOUND,
        message: `No existe ninguna instantánea de estado con id "${id}".`,
        origin: "persistence",
        recoverable: true,
      });
    }
    return snapshot;
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("status-manager", { providers: this.registry.list() });
    }

    context.reportStatus(SystemStatus.OK, "status-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: StatusEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `status.${phase}`,
        { snapshotId: correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "snapshot.failed") {
        await logger.error(`status:${phase} ${correlationId}`);
      } else {
        await logger.info(`status:${phase} ${correlationId}`);
      }
    }
  }
}
