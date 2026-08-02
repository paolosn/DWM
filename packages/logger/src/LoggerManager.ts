import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import { LoggerFactory } from "./LoggerFactory.js";
import { Logger } from "./Logger.js";
import type { LoggerConfiguration } from "./LoggerConfiguration.js";
import { LoggerErrorCode } from "./errors/LoggerErrorCode.js";
import { LoggerError } from "./errors/LoggerError.js";

/**
 * Módulo de logging del sistema DWM. Implementa `IModule` (ADR-002 §3): se
 * registra en el Core mediante `registerModule`, recibe únicamente el
 * `ModuleContext` mínimo (bus de eventos, configuración, perfil, reporte de
 * estado), y no contiene lógica de ninguna herramienta o sistema operativo.
 *
 * Durante `init()`, se suscribe (solo lectura, ADR-002 §5.3) al evento
 * `core:error` del Core para registrar automáticamente cualquier error no
 * recuperable del sistema, sin emitir nunca eventos bajo el namespace
 * reservado `core:*`.
 */
export class LoggerManager implements IModule {
  readonly id = "logger-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly factory: LoggerFactory;
  private readonly loggers = new Map<string, Logger>();
  private unsubscribeCoreError?: () => void;

  constructor(private readonly config: LoggerConfiguration) {
    this.factory = new LoggerFactory(config);
  }

  /** Devuelve (creando si es necesario) el logger con el nombre indicado. */
  getLogger(name: string, context?: Record<string, unknown>): Logger {
    const existing = this.loggers.get(name);
    if (existing) return existing;
    const logger = this.factory.createLogger(name, context);
    this.loggers.set(name, logger);
    return logger;
  }

  async init(context: ModuleContext): Promise<void> {
    const coreLogger = this.getLogger("core");
    this.unsubscribeCoreError = context.eventBus.on("core:error", (payload) => {
      const { error } = payload as { error: { message: string; code: string; origin: string } };
      void coreLogger.error(error.message, { code: error.code, origin: error.origin });
    });
    context.reportStatus(SystemStatus.OK, "logger-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.unsubscribeCoreError?.();
    const failures: unknown[] = [];
    for (const transport of this.config.transports) {
      if (!transport.dispose) continue;
      try {
        await transport.dispose();
      } catch (err) {
        failures.push(err);
      }
    }
    if (failures.length > 0) {
      throw LoggerError.wrap(failures[0], {
        code: LoggerErrorCode.LOGGER_TRANSPORT_DISPOSE_FAILED,
        origin: "transport",
        recoverable: true,
        message: `Fallo al liberar ${failures.length} transporte(s) de log.`,
      });
    }
  }
}
