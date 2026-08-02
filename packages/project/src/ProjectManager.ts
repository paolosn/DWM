import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import { Project } from "./Project.js";
import { ProjectRegistry } from "./ProjectRegistry.js";
import { ProjectStore, type PersistedProject } from "./ProjectStore.js";
import { ProjectValidator } from "./ProjectValidator.js";
import {
  createInitialProjectMetadata,
  touchProjectMetadata,
  type ProjectMetadata,
} from "./ProjectMetadata.js";
import type { ProjectConfiguration } from "./ProjectConfiguration.js";
import { validateProjectConfiguration } from "./ProjectConfiguration.js";
import type { ProjectContext } from "./ProjectContext.js";
import { ProjectErrorCode } from "./errors/ProjectErrorCode.js";
import { ProjectError, createProjectError } from "./errors/ProjectError.js";

export interface ProjectManagerOptions {
  readonly projectsDir: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  /** Si se indica y hay un Scheduler inyectado, se revalida periódicamente el proyecto activo. */
  readonly revalidateIntervalMs?: number;
}

type ProjectEventPhase =
  | "created"
  | "updated"
  | "deleted"
  | "cloned"
  | "imported"
  | "exported"
  | "opened"
  | "closed"
  | "reloaded"
  | "validation.ok"
  | "validation.error";

const REVALIDATE_TASK_ID = "project-revalidate";

/**
 * Gestor de proyectos del sistema DWM. Implementa `IModule` (ADR-002 §3):
 * se registra en el Core mediante `registerModule`, recibe únicamente el
 * `ModuleContext` mínimo, y no contiene lógica de ninguna herramienta o
 * sistema operativo. Cada proyecto representa un entorno de trabajo (ruta,
 * workspace asociado, herramientas/adaptadores utilizados) y está siempre
 * asociado a un único perfil de `@dwm/profile`.
 */
export class ProjectManager implements IModule {
  readonly id = "project-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new ProjectRegistry();
  private readonly store: ProjectStore;
  private readonly validator: ProjectValidator;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly secretsManager?: SecretsManager;
  private readonly aiManager?: AIManager;
  private readonly adapterManager?: AdapterManager;
  private readonly toolingManager?: ToolingManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly profileManager?: ProfileManager;
  private readonly revalidateIntervalMs?: number;
  private revalidateTaskHandle?: TaskHandle;

  constructor(options: ProjectManagerOptions) {
    if (!options || typeof options.projectsDir !== "string" || options.projectsDir.length === 0) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
        message: "ProjectManagerOptions.projectsDir es obligatorio y debe ser una cadena no vacía.",
        origin: "configuration",
        recoverable: false,
      });
    }
    this.store = new ProjectStore(options.projectsDir);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.adapterManager) this.adapterManager = options.adapterManager;
    if (options.toolingManager) this.toolingManager = options.toolingManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.profileManager) this.profileManager = options.profileManager;
    if (options.revalidateIntervalMs) this.revalidateIntervalMs = options.revalidateIntervalMs;

    this.validator = new ProjectValidator({
      ...(this.workspaceManager ? { workspaceManager: this.workspaceManager } : {}),
      ...(this.toolingManager ? { toolingManager: this.toolingManager } : {}),
      ...(this.adapterManager ? { adapterManager: this.adapterManager } : {}),
      ...(this.profileManager ? { profileManager: this.profileManager } : {}),
    });
  }

  // ---------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------

  async createProject(
    name: string,
    description: string,
    configuration: ProjectConfiguration
  ): Promise<Project> {
    validateProjectConfiguration(configuration);
    const metadata = createInitialProjectMetadata(randomUUID(), name, description);
    await this.store.write({ metadata, configuration });

    const project = new Project(metadata, configuration);
    this.registry.register(project);
    await this.notify("created", project.id);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    const project = this.registry.require(id);
    if (project.state === "open") {
      await this.closeProject(id);
    }
    await this.store.delete(id);
    this.registry.setState(id, "deleted");
    this.registry.unregister(id);
    await this.notify("deleted", id);
  }

  async updateProject(
    id: string,
    updates: Partial<{ name: string; description: string; configuration: ProjectConfiguration }>
  ): Promise<void> {
    const project = this.registry.require(id);
    const nextConfiguration = updates.configuration ?? project.configuration;
    validateProjectConfiguration(nextConfiguration);

    const nextMetadata = touchProjectMetadata({
      ...project.metadata,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    });

    await this.store.write({ metadata: nextMetadata, configuration: nextConfiguration });
    project.setMetadata(nextMetadata);
    project.setConfiguration(nextConfiguration);
    await this.notify("updated", id);
  }

  async cloneProject(id: string, newName: string): Promise<Project> {
    const source = this.registry.require(id);
    const cloned = await this.createProject(
      newName,
      source.metadata.description,
      source.configuration
    );
    await this.notify("cloned", cloned.id);
    return cloned;
  }

  /** Exportación segura: solo metadatos y configuración. */
  async exportProject(id: string): Promise<string> {
    const project = this.registry.require(id);
    const bundle: PersistedProject = {
      metadata: project.metadata,
      configuration: project.configuration,
    };
    await this.notify("exported", id);
    return JSON.stringify(bundle, null, 2);
  }

  async importProject(bundle: string, options: { overwrite?: boolean } = {}): Promise<Project> {
    let parsed: Partial<PersistedProject>;
    try {
      parsed = JSON.parse(bundle) as Partial<PersistedProject>;
    } catch (err) {
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_IMPORT_FAILED,
        origin: "import",
        recoverable: true,
        message: "El paquete de importación no es JSON válido.",
      });
    }
    if (!parsed || !parsed.metadata || !parsed.configuration) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_IMPORT_FAILED,
        message: 'El paquete de importación debe contener "metadata" y "configuration".',
        origin: "import",
        recoverable: true,
      });
    }
    validateProjectConfiguration(parsed.configuration);

    const existing = this.registry.get(parsed.metadata.id);
    if (existing && !options.overwrite) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_ALREADY_EXISTS,
        message: `Ya existe un proyecto con id "${parsed.metadata.id}"; use overwrite:true para sobrescribirlo.`,
        origin: "import",
        recoverable: true,
      });
    }
    if (existing) {
      this.registry.unregister(parsed.metadata.id);
    }

    const metadata = parsed.metadata as ProjectMetadata;
    const configuration = parsed.configuration as ProjectConfiguration;
    await this.store.write({ metadata, configuration });
    const project = new Project(metadata, configuration);
    this.registry.register(project);
    await this.notify("imported", project.id);
    return project;
  }

  async validateProject(id: string): Promise<void> {
    const project = this.registry.require(id);
    try {
      await this.validator.validate(project.configuration);
      await this.notify("validation.ok", id);
    } catch (err) {
      await this.notify("validation.error", id);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Apertura y cierre
  // ---------------------------------------------------------------------

  /**
   * Abre el proyecto: cierra el previamente abierto (si lo hubiera), valida
   * su configuración, y orquesta el resto de gestores integrados (perfil
   * asociado, workspace asociado, herramientas/adaptadores utilizados) de
   * forma tolerante a fallos parciales.
   */
  async openProject(id: string): Promise<void> {
    const project = this.registry.require(id);
    await this.validator.validate(project.configuration).catch((err) => {
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_OPEN_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al abrir el proyecto "${id}": la configuración no es válida.`,
      });
    });

    const currentActive = this.registry.getActiveId();
    if (currentActive && currentActive !== id) {
      await this.closeProject(currentActive);
    }

    const { configuration } = project;

    if (this.profileManager && this.profileManager.getProfile(configuration.profileId)) {
      await this.profileManager.setActiveProfile(configuration.profileId).catch(() => {});
    }
    if (
      configuration.workspaceId &&
      this.workspaceManager?.getWorkspace(configuration.workspaceId)
    ) {
      this.workspaceManager.setActiveWorkspace(configuration.workspaceId);
    }
    if (this.toolingManager) {
      for (const toolId of configuration.usedTools) {
        if (this.toolingManager.getState(toolId) !== undefined) {
          await this.toolingManager.activateTool(toolId).catch(() => {});
        }
      }
    }
    if (this.adapterManager) {
      for (const adapterId of configuration.usedAdapters) {
        if (this.adapterManager.getState(adapterId) !== undefined) {
          await this.adapterManager.activateAdapter(adapterId).catch(() => {});
        }
      }
    }

    this.registry.setState(id, "open");
    await this.notify("opened", id);
  }

  async closeProject(id: string): Promise<void> {
    this.registry.setState(id, "closed");
    await this.notify("closed", id);
  }

  getActiveProject(): Project | undefined {
    return this.registry.getActive();
  }

  // ---------------------------------------------------------------------
  // Consulta, búsqueda y recarga
  // ---------------------------------------------------------------------

  getProject(id: string): Project | undefined {
    return this.registry.get(id);
  }

  listProjects(): string[] {
    return this.registry.list();
  }

  searchProjects(query: string): string[] {
    const needle = query.toLowerCase();
    return this.registry.list().filter((id) => {
      const project = this.registry.require(id);
      return (
        project.metadata.name.toLowerCase().includes(needle) ||
        project.metadata.description.toLowerCase().includes(needle) ||
        project.configuration.projectPath.toLowerCase().includes(needle)
      );
    });
  }

  /** Recarga: relee metadatos y configuración desde disco, actualizando la caché en memoria sin alterar el estado. */
  async reloadProject(id: string): Promise<void> {
    const project = this.registry.require(id);
    const persisted = await this.store.read(id);
    if (!persisted) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_NOT_FOUND,
        message: `No se encontró en disco el proyecto "${id}" para recargar.`,
        origin: "persistence",
        recoverable: true,
      });
    }
    project.setMetadata(persisted.metadata);
    project.setConfiguration(persisted.configuration);
    await this.notify("reloaded", id);
  }

  getProjectContext(id: string): ProjectContext {
    const project = this.registry.require(id);
    return {
      projectId: project.id,
      configuration: project.configuration,
      ...(this.logger ? { logger: this.logger.withCorrelationId(project.id) } : {}),
      ...(this.eventBus ? { eventBus: this.eventBus } : {}),
      ...(this.scheduler ? { scheduler: this.scheduler } : {}),
      ...(this.aiManager ? { aiManager: this.aiManager } : {}),
      ...(this.adapterManager ? { adapterManager: this.adapterManager } : {}),
      ...(this.toolingManager ? { toolingManager: this.toolingManager } : {}),
      ...(this.workspaceManager ? { workspaceManager: this.workspaceManager } : {}),
      ...(this.profileManager ? { profileManager: this.profileManager } : {}),
      getSecret: async (key: string) =>
        this.secretsManager ? this.secretsManager.getSecret(key) : undefined,
      getConfigSection: async <T>(namespace: string) =>
        this.configManager ? this.configManager.getSection<T>(namespace) : undefined,
    };
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("project-manager", {
        projects: this.registry.list(),
        activeProjectId: this.registry.getActiveId(),
      });
    }

    if (this.scheduler && this.revalidateIntervalMs) {
      this.revalidateTaskHandle = this.scheduler.schedule(
        async () => {
          const activeId = this.registry.getActiveId();
          if (activeId) await this.validateProject(activeId).catch(() => {});
        },
        { id: REVALIDATE_TASK_ID, intervalMs: this.revalidateIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "project-manager inicializado");
  }

  /** Apagado limpio: cancela la revalidación periódica. No modifica el estado de los proyectos ni de otros gestores. */
  async dispose(): Promise<void> {
    this.revalidateTaskHandle?.cancel();
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: ProjectEventPhase, projectId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`project.${phase}`, { projectId }, { correlationId: projectId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(projectId);
      if (phase.includes("error")) {
        await logger.error(`project:${phase} ${projectId}`);
      } else {
        await logger.info(`project:${phase} ${projectId}`);
      }
    }
  }
}
