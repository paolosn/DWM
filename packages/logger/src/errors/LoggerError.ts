import type { LoggerErrorCode } from "./LoggerErrorCode.js";

/**
 * `DWMError` tipa `code` y `origin` de forma cerrada al vocabulario del
 * propio Core (congelado); no admite los códigos `LOGGER_*` sin forzar el
 * tipo. `LoggerError` reproduce la misma forma (`code`, `message`, `origin`,
 * `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase propia de
 * `@dwm/logger`, con su propio catálogo cerrado.
 */
export type LoggerErrorOrigin = "configuration" | "transport";

export interface LoggerErrorOptions {
  code: LoggerErrorCode;
  message: string;
  origin: LoggerErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class LoggerError extends Error {
  public readonly code: LoggerErrorCode;
  public readonly origin: LoggerErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: LoggerErrorOptions) {
    super(options.message);
    this.name = "LoggerError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LoggerError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<LoggerErrorOptions, "cause" | "message"> & { message?: string }
  ): LoggerError {
    if (err instanceof LoggerError) return err;
    const message =
      options.message ?? (err instanceof Error ? err.message : "Error desconocido en el logger");
    return new LoggerError({ ...options, message, cause: err });
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      origin: this.origin,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
    };
  }
}

export function createLoggerError(options: LoggerErrorOptions): LoggerError {
  return new LoggerError(options);
}
