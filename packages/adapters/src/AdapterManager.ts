import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { BaseAdapter } from "./BaseAdapter.js";
import type { AdapterFactory } from "./AdapterFactory.js";
import { AdapterRegistry } from "./AdapterRegistry.js";
import type { AdapterConfiguration } from "./AdapterConfiguration.js";
import {
  defaultAdapterConfiguration,
  validateAdapterConfiguration,
} from "./AdapterConfiguration.js";
import type { AdapterState } from "./AdapterState.js";
import type { AdapterHealth } from "./AdapterHealth.js";
import { makeHealth } from "./AdapterHealth.js";
import type { AdapterCapabilities } from "./AdapterCapabilities.js";
import type { AdapterContext } from "./AdapterContext.js";
import { AdapterErrorCode } from "./errors/AdapterErrorCode.js";
import { AdapterError } from "./errors/AdapterError.js";

export interface AdapterManagerOptions {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  /** Si se indica y hay un Scheduler inyectado, se programa un health check periódico de todos los adaptadores. */
  readonly healthCheckIntervalMs?: number;
}

type AdapterEventPhase =
  | "registered"
  | "unregistered"
  | "initialized"
  | "activated"
  | "deactivated"
  | "reloaded"
  | "disposed"
  | "health.ok"
  | "health.error";

const HEALTH_CHECK_TASK_ID = "adapters-health-check";

/**
 * Módulo de infraestructura de adaptadores del sistema DWM. Implementa
 * `IModule` (ADR-002 §3): se registra en el Core mediante `registerModule`,
 * recibe únicamente el `ModuleContext` mínimo, y no contiene lógica de
 * ninguna herramienta o sistema operativo concreta. Orquesta el ciclo de
 * vida (`registrado → inicializado → activo/inactivo → eliminado`) de
 * instancias de `BaseAdapter` mantenidas en un `AdapterRegistry`, e integra
 * `@dwm/logger`, `@dwm/event-bus`, `@dwm/scheduler`, `@dwm/config`,
 * `@dwm/secrets` y `@dwm/ai-manager` de forma opcional a través de
 * `AdapterContext`.
 */
export class AdapterManager implements IModule {
  readonly id = "adapter-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new AdapterRegistry();
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly scheduler?: Scheduler;
  private readonly configManager?: ConfigManager;
  private readonly secretsManager?: SecretsManager;
  private readonly aiManager?: AIManager;
  private readonly healthCheckIntervalMs?: number;
  private healthCheckTaskHandle?: TaskHandle;

  constructor(options: AdapterManagerOptions = {}) {
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.healthCheckIntervalMs) this.healthCheckIntervalMs = options.healthCheckIntervalMs;
  }

  // ---------------------------------------------------------------------
  // Registro dinámico y descubrimiento
  // ---------------------------------------------------------------------

  registerAdapter(
    adapter: BaseAdapter,
    configuration: AdapterConfiguration = defaultAdapterConfiguration()
  ): void {
    validateAdapterConfiguration(configuration);
    this.registry.register(adapter, configuration);
    void this.notify("registered", adapter.id);
  }

  async registerAdapterFactory(
    factory: AdapterFactory,
    configuration: AdapterConfiguration = defaultAdapterConfiguration()
  ): Promise<BaseAdapter> {
    const adapter = await factory.create();
    this.registerAdapter(adapter, configuration);
    return adapter;
  }

  async unregisterAdapter(id: string): Promise<void> {
    const record = this.registry.require(id);
    if (record.state !== "disposed") {
      await this.disposeInternal(id);
    }
    this.registry.unregister(id);
    void this.notify("unregistered", id);
  }

  /** Descubrimiento: lista los adaptadores actualmente registrados. */
  discoverAdapters(): string[] {
    return this.registry.list();
  }

  // ---------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------

  async initializeAdapter(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await record.adapter.onInit(this.buildContext(id));
      this.registry.setState(id, "initialized");
      await this.notify("initialized", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw AdapterError.wrap(err, {
        code: AdapterErrorCode.ADAPTER_INIT_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al inicializar el adaptador "${id}".`,
      });
    }
  }

  /** Inicializa todos los adaptadores habilitados, respetando dependencias y prioridad. */
  async initializeAll(): Promise<void> {
    for (const id of this.registry.resolveInitOrder()) {
      await this.initializeAdapter(id);
    }
  }

  async activateAdapter(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await record.adapter.onActivate(this.buildContext(id));
      this.registry.setState(id, "active");
      await this.notify("activated", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw AdapterError.wrap(err, {
        code: AdapterErrorCode.ADAPTER_ACTIVATE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al activar el adaptador "${id}".`,
      });
    }
  }

  async deactivateAdapter(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await record.adapter.onDeactivate();
      this.registry.setState(id, "inactive");
      await this.notify("deactivated", id);
    } catch (err) {
      this.registry.setState(id, "error");
      throw AdapterError.wrap(err, {
        code: AdapterErrorCode.ADAPTER_DEACTIVATE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al desactivar el adaptador "${id}".`,
      });
    }
  }

  /** Recarga: desactiva (si procede), elimina y reconstruye su estado, reactivando si estaba activo. */
  async reloadAdapter(id: string): Promise<void> {
    const record = this.registry.require(id);
    const wasActive = record.state === "active";

    if (record.state === "active") {
      await this.deactivateAdapter(id);
    }
    await this.disposeAdapterOnly(id);
    this.registry.setState(id, "registered");
    await this.initializeAdapter(id);
    if (wasActive) {
      await this.activateAdapter(id);
    }
    await this.notify("reloaded", id);
  }

  // ---------------------------------------------------------------------
  // Estado, capacidades y salud
  // ---------------------------------------------------------------------

  getState(id: string): AdapterState | undefined {
    return this.registry.get(id)?.state;
  }

  getCapabilities(id: string): AdapterCapabilities | undefined {
    return this.registry.get(id)?.adapter.capabilities;
  }

  getHealth(id: string): AdapterHealth | undefined {
    return this.registry.get(id)?.health;
  }

  listAdapters(): string[] {
    return this.registry.list();
  }

  async checkHealth(id: string): Promise<AdapterHealth> {
    const record = this.registry.require(id);
    try {
      const healthy = await record.adapter.checkHealth();
      const health = makeHealth(id, healthy);
      this.registry.setHealth(id, health);
      await this.notify(healthy ? "health.ok" : "health.error", id);
      return health;
    } catch (err) {
      const wrapped = AdapterError.wrap(err, {
        code: AdapterErrorCode.ADAPTER_HEALTH_CHECK_FAILED,
        origin: "health-check",
        recoverable: true,
        message: `Fallo en el health check del adaptador "${id}".`,
      });
      const health = makeHealth(id, false, wrapped.message);
      this.registry.setHealth(id, health);
      await this.notify("health.error", id);
      return health;
    }
  }

  async checkAllHealth(): Promise<AdapterHealth[]> {
    const results: AdapterHealth[] = [];
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
      await this.configManager.setSection("adapters-manager", { adapters: this.registry.list() });
    }

    if (this.scheduler && this.healthCheckIntervalMs) {
      this.healthCheckTaskHandle = this.scheduler.schedule(
        () => this.checkAllHealth().then(() => undefined),
        { id: HEALTH_CHECK_TASK_ID, intervalMs: this.healthCheckIntervalMs }
      );
    }

    context.reportStatus(SystemStatus.OK, "adapter-manager inicializado");
  }

  /** Apagado limpio: cancela el health check periódico y elimina (con dispose) todos los adaptadores registrados. */
  async dispose(): Promise<void> {
    this.healthCheckTaskHandle?.cancel();
    for (const id of this.registry.list()) {
      const record = this.registry.get(id);
      if (record && record.state !== "disposed") {
        await this.disposeInternal(id);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private buildContext(id: string): AdapterContext {
    return {
      ...(this.logger ? { logger: this.logger.withCorrelationId(id) } : {}),
      ...(this.eventBus ? { eventBus: this.eventBus } : {}),
      ...(this.scheduler ? { scheduler: this.scheduler } : {}),
      ...(this.aiManager ? { aiManager: this.aiManager } : {}),
      getSecret: async (key: string) =>
        this.secretsManager ? this.secretsManager.getSecret(key) : undefined,
      getConfigSection: async <T>(namespace: string) =>
        this.configManager ? this.configManager.getSection<T>(namespace) : undefined,
    };
  }

  private async disposeAdapterOnly(id: string): Promise<void> {
    const record = this.registry.require(id);
    try {
      await record.adapter.onDispose();
    } catch (err) {
      throw AdapterError.wrap(err, {
        code: AdapterErrorCode.ADAPTER_DISPOSE_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al liberar el adaptador "${id}".`,
      });
    }
  }

  private async disposeInternal(id: string): Promise<void> {
    await this.disposeAdapterOnly(id);
    this.registry.setState(id, "disposed");
    await this.notify("disposed", id);
  }

  private async notify(phase: AdapterEventPhase, adapterId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`adapters.${phase}`, { adapterId }, { correlationId: adapterId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(adapterId);
      if (phase.includes("error")) {
        await logger.error(`adapters:${phase} ${adapterId}`);
      } else {
        await logger.info(`adapters:${phase} ${adapterId}`);
      }
    }
  }
}
