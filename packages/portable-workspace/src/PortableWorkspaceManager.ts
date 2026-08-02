import * as path from "node:path";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager as EngineWorkspaceManager } from "@dwm/workspace";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { WorkspaceLocator, type MoveDetectionResult } from "./WorkspaceLocator.js";
import { WorkspaceInitializer, type InitializeResult } from "./WorkspaceInitializer.js";
import { WorkspaceValidator } from "./WorkspaceValidator.js";
import { WorkspaceRegistry, type WorkspaceRegistryEntry } from "./WorkspaceRegistry.js";
import { WorkspacePaths } from "./WorkspacePaths.js";
import {
  readWorkspaceMetadata,
  touchWorkspaceMetadata,
  writeWorkspaceMetadata,
  type WorkspaceMetadata,
} from "./WorkspaceMetadata.js";
import type { WorkspaceValidationResult } from "./WorkspaceTypes.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

export interface PortableWorkspaceManagerOptions {
  /** Directorio desde el que empezar a buscar la raíz de DWM; por defecto, el directorio de trabajo actual. */
  readonly startDir?: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: EngineWorkspaceManager;
  readonly backupManager?: BackupManager;
  readonly restoreManager?: RestoreManager;
  readonly migrationManager?: MigrationManager;
  readonly verificationManager?: VerificationManager;
}

export interface SuggestedPaths {
  readonly backupsCatalogDir: string;
  readonly restoreHistoryDir: string;
  readonly migrationHistoryDir: string;
  readonly verificationHistoryDir: string;
  readonly configDir: string;
  readonly secretsDir: string;
  readonly profilesDir: string;
  readonly pluginsDir: string;
  readonly logsDir: string;
}

type WorkspaceEventPhase = "located" | "initialized" | "reused" | "activated" | "moved";

/**
 * Sección persistida en `ConfigManager` bajo el namespace
 * `"portable-workspace"`. `lastKnownRoot` es únicamente una pista de
 * recuperación (nunca la fuente de verdad): en cada arranque se
 * revalida contra la metadata real del Workspace antes de confiar en
 * ella (ver `recoverFromLastKnownRoot`), igual que si no se hubiera
 * persistido nada.
 */
interface PortableWorkspaceConfigSection {
  readonly activeId?: string;
  readonly lastKnownRoot?: string;
  readonly integrations?: readonly string[];
}

/**
 * Responsable del Workspace físico portable de DWM: detecta
 * automáticamente su raíz (sin depender nunca de rutas absolutas
 * persistentes), crea la estructura necesaria sin eliminar nada
 * existente, valida estructura/permisos/metadata, y expone las rutas
 * mediante una API pública consistente con el resto del Engine. Implementa
 * `IModule` (ADR-002 §3). No importa el antiguo SISTEMA-DE-TRABAJO: eso es
 * responsabilidad de un módulo posterior.
 */
export class PortableWorkspaceManager implements IModule {
  readonly id = "portable-workspace-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly locator = new WorkspaceLocator();
  private readonly initializer = new WorkspaceInitializer();
  private readonly validator = new WorkspaceValidator();
  private readonly registry = new WorkspaceRegistry();
  private readonly startDir: string;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: EngineWorkspaceManager;
  private readonly backupManager?: BackupManager;
  private readonly restoreManager?: RestoreManager;
  private readonly migrationManager?: MigrationManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: PortableWorkspaceManagerOptions = {}) {
    this.startDir = options.startDir ?? process.cwd();
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.backupManager) this.backupManager = options.backupManager;
    if (options.restoreManager) this.restoreManager = options.restoreManager;
    if (options.migrationManager) this.migrationManager = options.migrationManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Localización
  // ---------------------------------------------------------------------

  async locateRoot(startDir: string = this.startDir): Promise<string | undefined> {
    const root = await this.locator.locate(startDir);
    if (root) await this.notify("located", root);
    return root;
  }

  async detectMove(previousRoot: string, previousMetadataId: string): Promise<MoveDetectionResult> {
    const result = await this.locator.detectMove(previousRoot, previousMetadataId, this.startDir);
    if (result.moved && result.newRoot) await this.notify("moved", result.newRoot);
    return result;
  }

  /**
   * Punto de entrada recomendado para localizar el Workspace al arrancar
   * la aplicación. A diferencia de `locateRoot()` (búsqueda ascendente
   * "en frío" desde `startDir`), primero intenta recuperar el Workspace
   * activo de la sesión anterior a partir de la pista mínima persistida
   * en `ConfigManager` (`registerActiveWorkspace` la guarda). La pista
   * nunca se usa a ciegas: se revalida contra la metadata real antes de
   * confiar en ella, y si ya no es válida, se reutiliza `WorkspaceLocator`
   * para comprobar si el Workspace fue movido junto con DWM. Sin
   * `ConfigManager`, o sin ninguna pista previa, el comportamiento es
   * idéntico a `locateRoot()`.
   */
  async locateOrRecoverActiveWorkspace(
    startDir: string = this.startDir
  ): Promise<string | undefined> {
    const recovered = await this.recoverFromLastKnownRoot(startDir);
    const root = recovered ?? (await this.locator.locate(startDir));
    if (root) await this.notify("located", root);
    return root;
  }

  private async recoverFromLastKnownRoot(startDir: string): Promise<string | undefined> {
    if (!this.configManager) return undefined;
    const hint =
      await this.configManager.getSection<PortableWorkspaceConfigSection>("portable-workspace");
    if (!hint?.lastKnownRoot || !hint.activeId) return undefined;

    if (await this.locator.looksLikeDwmRoot(hint.lastKnownRoot)) {
      const metadata = await readWorkspaceMetadata(new WorkspacePaths(hint.lastKnownRoot));
      if (metadata?.id === hint.activeId) return path.resolve(hint.lastKnownRoot);
    }

    // El Workspace ya no está donde se recordaba: puede haber sido movido
    // junto con DWM. `detectMove` busca, desde `startDir`, una raíz cuya
    // metadata declare el mismo id que la pista anterior.
    const moveResult = await this.locator.detectMove(hint.lastKnownRoot, hint.activeId, startDir);
    return moveResult.moved ? moveResult.newRoot : undefined;
  }

  // ---------------------------------------------------------------------
  // Inicialización y validación
  // ---------------------------------------------------------------------

  async initializeWorkspace(root?: string): Promise<InitializeResult> {
    const target = root ?? (await this.locator.locate(this.startDir)) ?? this.startDir;
    const result = await this.initializer.initialize(target);
    await this.notify(result.alreadyInitialized ? "reused" : "initialized", result.metadata.id);
    return result;
  }

  async validateWorkspace(root: string): Promise<WorkspaceValidationResult> {
    return this.validator.validate(root);
  }

  async assertValidWorkspace(root: string): Promise<void> {
    return this.validator.assertValid(root);
  }

  // ---------------------------------------------------------------------
  // Rutas y metadata
  // ---------------------------------------------------------------------

  getPaths(root: string): WorkspacePaths {
    return new WorkspacePaths(root);
  }

  async getMetadata(root: string): Promise<WorkspaceMetadata | undefined> {
    return readWorkspaceMetadata(new WorkspacePaths(root));
  }

  async saveMetadata(root: string, metadata: WorkspaceMetadata): Promise<void> {
    await writeWorkspaceMetadata(new WorkspacePaths(root), touchWorkspaceMetadata(metadata));
  }

  getSuggestedPaths(root: string): SuggestedPaths {
    const paths = new WorkspacePaths(root);
    return {
      backupsCatalogDir: path.join(paths.backups, "catalog"),
      restoreHistoryDir: path.join(paths.backups, "restore-history"),
      migrationHistoryDir: path.join(paths.backups, "migration-history"),
      verificationHistoryDir: path.join(paths.dwmDir, "verification-history"),
      configDir: paths.config,
      secretsDir: paths.secrets,
      profilesDir: paths.profiles,
      pluginsDir: paths.plugins,
      logsDir: paths.logs,
    };
  }

  // ---------------------------------------------------------------------
  // Registro del Workspace activo
  // ---------------------------------------------------------------------

  async registerActiveWorkspace(root: string): Promise<WorkspaceRegistryEntry> {
    const metadata = await this.getMetadata(root);
    if (!metadata) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.PWORKSPACE_ROOT_NOT_LOCATED,
        message: `No hay metadata de Workspace portable en "${root}"; inicialízalo primero.`,
        origin: "registry",
        recoverable: true,
      });
    }
    if (!this.registry.has(metadata.id)) {
      this.registry.register(metadata, root);
    }
    this.registry.setActive(metadata.id);

    if (this.configManager) {
      const existing =
        await this.configManager.getSection<PortableWorkspaceConfigSection>("portable-workspace");
      await this.configManager.setSection("portable-workspace", {
        ...existing,
        activeId: metadata.id,
        lastKnownRoot: path.resolve(root),
      });
    }
    await this.notify("activated", metadata.id);
    return this.registry.require(metadata.id);
  }

  getActiveWorkspace(): WorkspaceRegistryEntry | undefined {
    return this.registry.getActive();
  }

  listConnectedIntegrations(): string[] {
    const connected: string[] = [];
    if (this.workspaceManager) connected.push("workspace");
    if (this.configManager) connected.push("config");
    if (this.backupManager) connected.push("backup");
    if (this.restoreManager) connected.push("restore");
    if (this.migrationManager) connected.push("migration");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  // ---------------------------------------------------------------------
  // Integración con @dwm/status
  // ---------------------------------------------------------------------

  toStatusProvider(): StatusProvider {
    return {
      id: "portable-workspace",
      getStatus: async () => {
        const active = this.registry.getActive();
        if (!active) {
          return makeStatusReport(
            "portable-workspace",
            "UNKNOWN",
            "No hay ningún Workspace portable activo."
          );
        }
        try {
          const result = await this.validator.validate(active.root);
          if (result.valid) {
            return makeStatusReport("portable-workspace", "OK", "El Workspace portable es válido.");
          }
          return makeStatusReport(
            "portable-workspace",
            "WARNING",
            `El Workspace portable presenta ${result.issues.length} problema(s).`,
            { issues: result.issues.length }
          );
        } catch (err) {
          return makeStatusReport(
            "portable-workspace",
            "ERROR",
            err instanceof Error ? err.message : String(err)
          );
        }
      },
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      const existing =
        await this.configManager.getSection<PortableWorkspaceConfigSection>("portable-workspace");
      await this.configManager.setSection("portable-workspace", {
        ...existing,
        activeId: this.registry.getActive()?.metadata.id ?? existing?.activeId,
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "portable-workspace-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: WorkspaceEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `portable-workspace.${phase}`,
        { correlationId },
        { correlationId }
      );
    }
    if (this.logger) {
      await this.logger
        .withCorrelationId(correlationId)
        .info(`portable-workspace:${phase} ${correlationId}`);
    }
  }
}
