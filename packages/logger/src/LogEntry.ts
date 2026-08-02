import type { LogLevel } from "./LogLevel.js";

/**
 * Entrada de log inmutable producida por un `Logger` y entregada a cada
 * transporte configurado. `timestamp` siempre está en UTC (ISO-8601, sufijo
 * "Z"), independientemente de la zona horaria del proceso.
 */
export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly loggerName: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}
