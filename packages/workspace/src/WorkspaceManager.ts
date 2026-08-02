import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import { Workspace } from "./Workspace.js";
import { WorkspaceRegistry } from "./WorkspaceRegistry.js";
import { WorkspaceLoader } from "./WorkspaceLoader.js";
import { WorkspaceScanner, type WorkspaceIndex } from "./WorkspaceScanner.js";
import { createInitialMetadata, touchMetadata } from "./WorkspaceMetadata.js";
import type { WorkspaceConfiguration } from "./WorkspaceConfiguration.js";
import {
  defaultWorkspaceConfiguration,
  validateWorkspaceConfiguration,
} from "./WorkspaceConfiguration.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

export interface WorkspaceManagerOptions {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
}

type WorkspaceEventPhase =
  | "created"
  | "opened"
  | "loaded"
  | "scan.start"
  | "scan.complete"
  | "saved"
  | "closing"
  | "closed"
  | "changes-detected"
  | "reloaded";

/**
 * Módulo de gestión de workspaces del sistema DWM. Implementa `IModule`
 * (ADR-002 §3): se registra en el Core mediante `registerModule`, recibe
 * únicamente el `ModuleContext` mínimo, y no contiene lógica de ninguna
 * herramienta o sistema operativo. Orquesta `WorkspaceLoader` (persistencia)
 * y `WorkspaceScanner` (indexación) sobre instancias de `Workspace`
 * mantenidas en un `WorkspaceRegistry`, e integra `@dwm/logger`,
 * `@dwm/event-bus` y `@dwm/scheduler` de forma opcional.
 */
export class WorkspaceManager implements IModule {
  readonly id = "workspace-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new WorkspaceRegistry();
  private readonly loader = new WorkspaceLoader();
  private readonly scanner = new WorkspaceScanner();
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly reloadTaskHandles = new Map<string, TaskHandle>();
  private shuttingDown = false;

  constructor(options: WorkspaceManagerOptions = {}) {
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
  }

  async createWorkspace(
    rootPath: string,
    name: string,
    configurationOverrides: Partial<WorkspaceConfiguration> = {}
  ): Promise<Workspace> {
    this.assertNotShuttingDown();
    await this.loader.assertValidPath(rootPath);
    if (await this.loader.isWorkspace(rootPath)) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_ALREADY_EXISTS,
        message: `Ya existe un workspace en "${rootPath}".`,
        origin: "path",
        recoverable: true,
      });
    }

    const configuration: WorkspaceConfiguration = {
      ...defaultWorkspaceConfiguration(),
      ...configurationOverrides,
    };
    validateWorkspaceConfiguration(configuration);

    const metadata = createInitialMetadata(randomUUID(), name, rootPath);
    await this.loader.saveMetadata(rootPath, metadata);
    await this.loader.saveConfiguration(rootPath, configuration);

    const workspace = new Workspace(metadata, configuration);
    await this.notify("created", workspace);

    await this.performScan(workspace);
    this.registry.register(workspace);
    this.maybeScheduleAutoReload(workspace);
    return workspace;
  }

  async openWorkspace(rootPath: string): Promise<Workspace> {
    this.assertNotShuttingDown();
    const workspace = await this.loadWorkspace(rootPath);
    this.registry.register(workspace);
    await this.notify("opened", workspace);
    this.maybeScheduleAutoReload(workspace);
    return workspace;
  }

  /** Carga metadatos, configuración y realiza un escaneo inicial, sin registrar el workspace como abierto. */
  async loadWorkspace(rootPath: string): Promise<Workspace> {
    this.assertNotShuttingDown();
    await this.loader.assertValidPath(rootPath);
    if (!(await this.loader.isWorkspace(rootPath))) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_NOT_A_WORKSPACE,
        message: `"${rootPath}" no contiene un workspace válido.`,
        origin: "path",
        recoverable: true,
      });
    }

    const metadata = await this.loader.loadMetadata(rootPath);
    const configuration = await this.loader.loadConfiguration(rootPath);
    const workspace = new Workspace(metadata, configuration);
    workspace.setState("loading");
    await this.notify("loaded", workspace);

    await this.performScan(workspace);
    return workspace;
  }

  async saveWorkspace(id: string): Promise<void> {
    const workspace = this.requireWorkspace(id);
    const metadata = touchMetadata(workspace.metadata);
    workspace.setMetadata(metadata);
    await this.loader.saveMetadata(workspace.rootPath, metadata);
    await this.loader.saveConfiguration(workspace.rootPath, workspace.configuration);
    await this.notify("saved", workspace);
  }

  async closeWorkspace(id: string): Promise<void> {
    const workspace = this.requireWorkspace(id);
    workspace.setState("closing");
    await this.notify("closing", workspace);

    this.cancelAutoReload(id);
    await this.saveWorkspace(id);

    workspace.setState("closed");
    this.registry.unregister(id);
    await this.notify("closed", workspace);
  }

  async detectChanges(id: string): Promise<boolean> {
    const workspace = this.requireWorkspace(id);
    const newIndex = await this.scanner.scan(
      workspace.rootPath,
      this.effectiveExcludePatterns(workspace)
    );
    const changed = workspace.index === null || workspace.index.signature !== newIndex.signature;

    if (changed) {
      await this.notify("changes-detected", workspace);
      if (workspace.configuration.autoReload) {
        await this.applyReload(workspace, newIndex);
      }
    }
    return changed;
  }

  async reloadWorkspace(id: string): Promise<void> {
    const workspace = this.requireWorkspace(id);
    const index = await this.scanner.scan(
      workspace.rootPath,
      this.effectiveExcludePatterns(workspace)
    );
    await this.applyReload(workspace, index);
  }

  getActiveWorkspace(): Workspace | undefined {
    return this.registry.getActive();
  }

  setActiveWorkspace(id: string): void {
    this.registry.setActive(id);
  }

  listWorkspaces(): readonly Workspace[] {
    return this.registry.list();
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.registry.get(id);
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por LoggerManager, EventBusManager
    // y SchedulerManager.
    context.getConfig();
    context.reportStatus(SystemStatus.OK, "workspace-manager inicializado");
  }

  /** Apagado limpio: cierra (guardando) todos los workspaces abiertos y cancela sus tareas de recarga. */
  async dispose(): Promise<void> {
    this.shuttingDown = true;
    for (const workspace of this.registry.list()) {
      await this.closeWorkspace(workspace.id);
    }
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private effectiveExcludePatterns(workspace: Workspace): readonly string[] {
    return [...workspace.configuration.excludePatterns, ".dwm-workspace/**"];
  }

  private async performScan(workspace: Workspace): Promise<void> {
    workspace.setState("scanning");
    await this.notify("scan.start", workspace);
    const index = await this.scanner.scan(
      workspace.rootPath,
      this.effectiveExcludePatterns(workspace)
    );
    workspace.setIndex(index);
    workspace.setState("ready");
    await this.notify("scan.complete", workspace);
  }

  private async applyReload(workspace: Workspace, index: WorkspaceIndex): Promise<void> {
    workspace.setState("scanning");
    workspace.setIndex(index);
    workspace.setMetadata(touchMetadata(workspace.metadata));
    workspace.setState("ready");
    await this.notify("reloaded", workspace);
  }

  private requireWorkspace(id: string): Workspace {
    const workspace = this.registry.get(id);
    if (!workspace) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
        message: `No existe ningún workspace abierto con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return workspace;
  }

  private maybeScheduleAutoReload(workspace: Workspace): void {
    if (!workspace.configuration.autoReload || !this.scheduler) return;
    const handle = this.scheduler.schedule(
      () => this.detectChanges(workspace.id).then(() => undefined),
      { id: `workspace-reload-${workspace.id}`, intervalMs: workspace.configuration.scanIntervalMs }
    );
    this.reloadTaskHandles.set(workspace.id, handle);
  }

  private cancelAutoReload(id: string): void {
    const handle = this.reloadTaskHandles.get(id);
    if (handle) {
      handle.cancel();
      this.reloadTaskHandles.delete(id);
    }
  }

  private async notify(phase: WorkspaceEventPhase, workspace: Workspace): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `workspace.${phase}`,
        { workspaceId: workspace.id, rootPath: workspace.rootPath },
        { correlationId: workspace.id }
      );
    }
    if (this.logger) {
      await this.logger.withCorrelationId(workspace.id).info(`workspace:${phase} ${workspace.id}`);
    }
  }

  private assertNotShuttingDown(): void {
    if (this.shuttingDown) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_CLOSED,
        message: "El gestor de workspaces se está apagando: no se aceptan nuevas operaciones.",
        origin: "lifecycle",
        recoverable: true,
      });
    }
  }
}
