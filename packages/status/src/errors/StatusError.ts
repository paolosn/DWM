import type { StatusErrorCode } from "./StatusErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `StatusError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/status`, con su propio catálogo cerrado.
 */
export type StatusErrorOrigin = "registry" | "provider" | "persistence" | "request";

export interface StatusErrorOptions {
  code: StatusErrorCode;
  message: string;
  origin: StatusErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class StatusError extends Error {
  public readonly code: StatusErrorCode;
  public readonly origin: StatusErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: StatusErrorOptions) {
    super(options.message);
    this.name = "StatusError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StatusError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<StatusErrorOptions, "cause" | "message"> & { message?: string }
  ): StatusError {
    if (err instanceof StatusError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de estado");
    return new StatusError({ ...options, message, cause: err });
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

export function createStatusError(options: StatusErrorOptions): StatusError {
  return new StatusError(options);
}
