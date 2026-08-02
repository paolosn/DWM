import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ToolDescriptor } from "./ToolDescriptor.js";
import { ToolRegistry } from "./ToolRegistry.js";
import type { ToolConfiguration } from "./ToolConfiguration.js";
import { defaultToolConfiguration, validateToolConfiguration } from "./ToolConfiguration.js";
import type { ToolState } from "./ToolState.js";
import type { ToolHealth } from "./ToolHealth.js";
import { makeToolHealth } from "./ToolHealth.js";
import type { ToolCapabilities } from "./ToolCapabilities.js";
import { emptyToolCapabilities } from "./ToolCapabilities.js";
import type { ToolInstance } from "./ToolInstance.js";
import type { ToolContext } from "./ToolContext.js";
import { ToolErrorCode } from "./errors/ToolErrorCode.js";
import { ToolError, createToolError } from "./errors/ToolError.js";

export interface ToolingManagerOptions {
  /** Integración obligatoria: descubre herramientas a partir de los adaptadores registrados. */
  readonly adapterManager: AdapterManager;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly workspaceManager?: WorkspaceManager;
  /** Si se indica y hay un Scheduler inyectado, se programa un health check periódico de todas las herramientas. */
  readonly healthCheckIntervalMs?: number;
}

type ToolEventPhase =
  | "discovered"
  | "registered"
  | "unregistered"
  | "initialized"
  | "activated"
  | "deactivated"
  | "reloaded"
  | "removed"
  | "health.ok"
  | "health.error";

const HEALTH_CHECK_TASK_ID = "tooling-health-check";

/**
 * Gestor central de herramientas del sistema DWM. Implementa `IModule`
 * (ADR-002 §3): se registra en el Core mediante `registerModule`, recibe
 * únicamente el `ModuleContext` mínimo, y no contiene lógica de ninguna
 * herramienta concreta (VSCode, Cursor, Windsurf, Claude Code, Git,
 * Ollama, OpenAI, Anthropic...): esa lógica pertenece únicamente a los
 * adaptadores de `@dwm/adapters`. Cada herramienta se apoya en un
 * adaptador ya registrado en `AdapterManager`; este módulo orquesta su
 * ciclo de vida a nivel de herramienta (registro, inicialización,
 * activación, desactivación, recarga, eliminación), delegando siempre la
 * ejecución real en `AdapterManager`.
 */
export class ToolingManager implements IModule {
  readonly id = "tooling-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new ToolRegistry();
  private readonly adapterManager: AdapterManager;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly secretsManager?: SecretsManager;
  private readonly aiManager?: AIManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly healthCheckIntervalMs?: number;
  private healthCheckTaskHandle?: TaskHandle;

  constructor(options: ToolingManagerOptions) {
    this.adapterManager = options.adapterManager;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.healthCheckIntervalMs) this.healthCheckIntervalMs = options.healthCheckIntervalMs;
  }

  // ---------------------------------------------------------------------
  // Registro y descubrimiento
  // ---------------------------------------------------------------------

  registerTool(
    descriptor: ToolDescriptor,
    configuration: ToolConfiguration = defaultToolConfiguration()
  ): void {
    validateToolConfiguration(configuration);
    this.registry.register(descriptor, configuration);
    void this.notify("registered", descriptor.id);
  }

  async unregisterTool(id: string): Promise<void> {
    this.registry.require(id);
    this.registry.unregister(id);
    void this.notify("unregistered", id);
  }

  /**
   * Descubrimiento: consulta los adaptadores registrados en `AdapterManager`
   * y registra como herramienta cada adaptador que aún no lo sea, con las
   * capacidades que el propio adaptador declara. Devuelve los ids de las
   * herramientas recién descubiertas.
   */
  discoverTools(): string[] {
    const discovered: string[] = [];
    for (const adapterId of this.adapterManager.discoverAdapters()) {
      if (this.registry.get(adapterId)) continue;
      const capabilities: ToolCapabilities =
        this.adapterManager.getCapabilities(adapterId) ?? emptyToolCapabilities();
      const descriptor: ToolDescriptor = {
        id: adapterId,
        name: adapterId,
        adapterId,
        capabilities,
      };
      this.registerTool(descriptor);
      discovered.push(adapterId);
      void this.notify("discovered", adapterId);
    }
    return discovered;
  }

  // ---------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------

  async initializeTool(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await this.adapterManager.initializeAdapter(record.descriptor.adapterId);
      this.registry.setState(id, "initialized");
      await this.notify("initialized", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_INIT_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al inicializar la herramienta "${id}".`,
      });
    }
  }

  /** Inicializa todas las herramientas habilitadas, respetando dependencias y prioridad. */
  async initializeAll(): Promise<void> {
    for (const id of this.registry.resolveInitOrder()) {
      await this.initializeTool(id);
    }
  }

  /** Valida que todas las capacidades requeridas por la herramienta estén provistas por alguna otra registrada. */
  validateCompatibility(id: string): void {
    const record = this.registry.require(id);
    for (const required of record.descriptor.capabilities.required) {
      const satisfied = this.registry
        .list()
        .filter((otherId) => otherId !== id)
        .some((otherId) =>
          this.registry
            .require(otherId)
            .descriptor.capabilities.provided.some((p) => p.name === required.name)
        );
      if (!satisfied) {
        throw createToolError({
          code: ToolErrorCode.TOOL_INCOMPATIBLE,
          message: `La herramienta "${id}" requiere la capacidad "${required.name}", que ninguna otra herramienta registrada provee.`,
          origin: "compatibility",
          recoverable: true,
        });
      }
    }
  }

  async activateTool(id: string): Promise<void> {
    const record = this.registry.require(id);
    this.validateCompatibility(id);

    const group = record.configuration.exclusiveGroup;
    if (group) {
      const currentActive = this.registry.getActiveInGroup(group);
      if (currentActive && currentActive !== id) {
        await this.deactivateTool(currentActive);
      }
    }

    try {
      await this.adapterManager.activateAdapter(record.descriptor.adapterId);
      this.registry.setState(id, "active");
      await this.notify("activated", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_ACTIVATE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al activar la herramienta "${id}".`,
      });
    }
  }

  async deactivateTool(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await this.adapterManager.deactivateAdapter(record.descriptor.adapterId);
      this.registry.setState(id, "inactive");
      await this.notify("deactivated", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_DEACTIVATE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al desactivar la herramienta "${id}".`,
      });
    }
  }

  /** Recarga: desactiva (si procede), recarga el adaptador subyacente y reactiva si estaba activa. */
  async reloadTool(id: string): Promise<void> {
    const record = this.registry.require(id);
    const wasActive = record.state === "active";

    if (record.state === "active") {
      await this.deactivateTool(id);
    }
    try {
      await this.adapterManager.reloadAdapter(record.descriptor.adapterId);
    } catch (err) {
      this.registry.setState(id, "error");
      throw ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_INIT_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al recargar la herramienta "${id}".`,
      });
    }
    this.registry.setState(id, "registered");
    this.registry.setState(id, "initialized");
    if (wasActive) {
      await this.activateTool(id);
    }
    await this.notify("reloaded", id);
  }

  /** Eliminación: desactiva si procede y retira la herramienta del registro (el adaptador subyacente no se toca). */
  async removeTool(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      if (record.state === "active") {
        await this.deactivateTool(id);
      }
      this.registry.setState(id, "removed");
      this.registry.unregister(id);
      await this.notify("removed", id);
    } catch (err) {
      throw ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_REMOVE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al eliminar la herramienta "${id}".`,
      });
    }
  }

  // ---------------------------------------------------------------------
  // Herramienta activa y consulta
  // ---------------------------------------------------------------------

  async setActiveTool(id: string): Promise<void> {
    await this.activateTool(id);
  }

  getActiveTool(group: string): string | undefined {
    return this.registry.getActiveInGroup(group);
  }

  listActiveTools(): string[] {
    return this.registry.listActive();
  }

  getState(id: string): ToolState | undefined {
    return this.registry.get(id)?.state;
  }

  getCapabilities(id: string): ToolCapabilities | undefined {
    return this.registry.get(id)?.descriptor.capabilities;
  }

  getHealth(id: string): ToolHealth | undefined {
    return this.registry.get(id)?.health;
  }

  listTools(): string[] {
    return this.registry.list();
  }

  getTool(id: string): ToolInstance | undefined {
    const record = this.registry.get(id);
    if (!record) return undefined;
    return {
      descriptor: record.descriptor,
      configuration: record.configuration,
      state: record.state,
      ...(record.health ? { health: record.health } : {}),
    };
  }

  getToolContext(id: string): ToolContext {
    const record = this.registry.require(id);
    return this.buildContext(
      record.descriptor.id,
      record.descriptor.adapterId,
      record.descriptor.capabilities,
      record.configuration
    );
  }

  // ---------------------------------------------------------------------
  // Salud
  // ---------------------------------------------------------------------

  async checkHealth(id: string): Promise<ToolHealth> {
    const record = this.registry.require(id);
    try {
      const adapterHealth = await this.adapterManager.checkHealth(record.descriptor.adapterId);
      const health = makeToolHealth(id, adapterHealth.healthy, adapterHealth.detail);
      this.registry.setHealth(id, health);
      await this.notify(adapterHealth.healthy ? "health.ok" : "health.error", id);
      return health;
    } catch (err) {
      const wrapped = ToolError.wrap(err, {
        code: ToolErrorCode.TOOL_HEALTH_CHECK_FAILED,
        origin: "health-check",
        recoverable: true,
        message: `Fallo en el health check de la herramienta "${id}".`,
      });
      const health = makeToolHealth(id, false, wrapped.message);
      this.registry.setHealth(id, health);
      await this.notify("health.error", id);
      return health;
    }
  }

  async checkAllHealth(): Promise<ToolHealth[]> {
    const results: ToolHealth[] = [];
    for (const id of this.registry.list()) {
      results.push(await this.checkHealth(id));
    }
    return results;
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("tooling-manager", { tools: this.registry.list() });
    }

    if (this.scheduler && this.healthCheckIntervalMs) {
      this.healthCheckTaskHandle = this.scheduler.schedule(
        () => this.checkAllHealth().then(() => undefined),
        { id: HEALTH_CHECK_TASK_ID, intervalMs: this.healthCheckIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "tooling-manager inicializado");
  }

  /** Apagado limpio: cancela el health check periódico. No toca el ciclo de vida de los adaptadores subyacentes. */
  async dispose(): Promise<void> {
    this.healthCheckTaskHandle?.cancel();
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private buildContext(
    toolId: string,
    adapterId: string,
    capabilities: ToolCapabilities,
    configuration: ToolConfiguration
  ): ToolContext {
    const activeWorkspace = this.workspaceManager?.getActiveWorkspace();
    return {
      toolId,
      adapterId,
      capabilities,
      configuration,
      ...(activeWorkspace ? { activeWorkspaceId: activeWorkspace.id } : {}),
      ...(this.logger ? { logger: this.logger.withCorrelationId(toolId) } : {}),
      ...(this.eventBus ? { eventBus: this.eventBus } : {}),
      ...(this.scheduler ? { scheduler: this.scheduler } : {}),
      ...(this.aiManager ? { aiManager: this.aiManager } : {}),
      getSecret: async (key: string) =>
        this.secretsManager ? this.secretsManager.getSecret(key) : undefined,
      getConfigSection: async <T>(namespace: string) =>
        this.configManager ? this.configManager.getSection<T>(namespace) : undefined,
    };
  }

  private async notify(phase: ToolEventPhase, toolId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`tooling.${phase}`, { toolId }, { correlationId: toolId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(toolId);
      if (phase.includes("error")) {
        await logger.error(`tooling:${phase} ${toolId}`);
      } else {
        await logger.info(`tooling:${phase} ${toolId}`);
      }
    }
  }
}
