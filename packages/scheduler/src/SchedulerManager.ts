import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import { Scheduler } from "./Scheduler.js";
import type { SchedulerConfiguration } from "./SchedulerConfiguration.js";

export interface SchedulerManagerOptions {
  readonly configuration?: SchedulerConfiguration;
  /** Logger opcional (de @dwm/logger) para correlacionar el ciclo de vida de cada tarea. */
  readonly logger?: Logger;
  /** Bus de eventos opcional (de @dwm/event-bus) para publicar el ciclo de vida de cada tarea. */
  readonly eventBus?: EventBus;
}

/**
 * Módulo de planificación del sistema DWM. Implementa `IModule` (ADR-002
 * §3): se registra en el Core mediante `registerModule`, recibe únicamente
 * el `ModuleContext` mínimo, y no contiene lógica de ninguna herramienta o
 * sistema operativo. `getScheduler()` expone la superficie de dominio
 * (`Scheduler`) que una capa host podría entregar, de forma selectiva, a un
 * `UseCaseCoordinator` (TDS-001 §11), sin que ello requiera modificar
 * `packages/host`.
 */
export class SchedulerManager implements IModule {
  readonly id = "scheduler-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly scheduler: Scheduler;

  constructor(options: SchedulerManagerOptions = {}) {
    this.scheduler = new Scheduler({
      ...(options.configuration ? { configuration: options.configuration } : {}),
      ...(options.logger ? { logger: options.logger } : {}),
      ...(options.eventBus ? { eventBus: options.eventBus } : {}),
    });
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3):
    // se deja constancia explícita de que la configuración ya está
    // disponible para este módulo; el propio Scheduler no necesita más de
    // ella que su propia SchedulerConfiguration (recibida en el
    // constructor), consistente con el patrón ya usado por LoggerManager y
    // EventBusManager.
    context.getConfig();
    context.reportStatus(SystemStatus.OK, "scheduler-manager inicializado");
  }

  async dispose(): Promise<void> {
    await this.scheduler.shutdown();
  }
}
