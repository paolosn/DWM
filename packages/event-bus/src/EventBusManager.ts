import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import { EventBus } from "./EventBus.js";

export interface EventBusManagerOptions {
  /** Logger opcional (de @dwm/logger) para correlacionar publicaciones y fallos. */
  readonly logger?: Logger;
}

/**
 * Módulo de bus de eventos del sistema DWM. Implementa `IModule` (ADR-002
 * §3): se registra en el Core mediante `registerModule`, recibe únicamente
 * el `ModuleContext` mínimo, y no contiene lógica de ninguna herramienta o
 * sistema operativo. `getBus()` expone la superficie de dominio (`EventBus`)
 * que una capa host podría entregar, de forma selectiva, a un
 * `UseCaseCoordinator` (TDS-001 §11), sin que ello requiera modificar
 * `packages/host`.
 */
export class EventBusManager implements IModule {
  readonly id = "event-bus-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly bus: EventBus;

  constructor(options: EventBusManagerOptions = {}) {
    this.bus = new EventBus(options.logger ? { logger: options.logger } : {});
  }

  getBus(): EventBus {
    return this.bus;
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3):
    // el nivel de log general decide si el bus registra sus publicaciones.
    const config = context.getConfig();
    this.bus.setDebugLogging(config.preferences.logLevel === "debug");
    context.reportStatus(SystemStatus.OK, "event-bus-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.bus.disposeAll();
  }
}
