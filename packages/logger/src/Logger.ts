import { LogLevel, meetsMinLevel } from "./LogLevel.js";
import type { LogEntry } from "./LogEntry.js";
import type { LoggerConfiguration } from "./LoggerConfiguration.js";

/**
 * Logger inmutable: cada operación que cambia contexto o `correlationId`
 * (`child`, `withCorrelationId`) devuelve una nueva instancia en vez de
 * mutar la actual, evitando que dos consumidores del mismo logger
 * interfieran entre sí.
 */
export class Logger {
  constructor(
    public readonly name: string,
    private readonly config: LoggerConfiguration,
    private readonly context: Readonly<Record<string, unknown>> = {},
    private readonly correlationId?: string
  ) {}

  trace(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.TRACE, message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.ERROR, message, metadata);
  }

  fatal(message: string, metadata?: Record<string, unknown>): Promise<void> {
    return this.log(LogLevel.FATAL, message, metadata);
  }

  /**
   * Devuelve un logger hijo cuyo contexto es la fusión del contexto actual
   * con `additionalContext`, y cuyo nombre se compone como
   * `"<padre>.<segmento>"` si se indica `nameSegment`. Hereda el
   * `correlationId` actual, si existe.
   */
  child(additionalContext: Record<string, unknown>, nameSegment?: string): Logger {
    const name = nameSegment ? `${this.name}.${nameSegment}` : this.name;
    return new Logger(
      name,
      this.config,
      { ...this.context, ...additionalContext },
      this.correlationId
    );
  }

  /** Devuelve un logger con el mismo nombre y contexto, ligado a `correlationId`. */
  withCorrelationId(correlationId: string): Logger {
    return new Logger(this.name, this.config, this.context, correlationId);
  }

  private async log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!meetsMinLevel(level, this.config.minLevel)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      loggerName: this.name,
      message,
      ...(Object.keys(this.context).length > 0 ? { context: this.context } : {}),
      ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(this.correlationId ? { correlationId: this.correlationId } : {}),
    };

    await Promise.all(
      this.config.transports.map(async (transport) => {
        try {
          await transport.write(entry);
        } catch (err) {
          this.config.onTransportError?.(transport, err);
        }
      })
    );
  }
}
