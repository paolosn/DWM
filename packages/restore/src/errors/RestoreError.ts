import type { RestoreErrorCode } from "./RestoreErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `RestoreError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/restore`, con su propio catálogo cerrado.
 */
export type RestoreErrorOrigin =
  | "request"
  | "registry"
  | "backup"
  | "chain"
  | "target"
  | "lifecycle"
  | "verification"
  | "rollback"
  | "persistence"
  | "provider"
  | "concurrency";

export interface RestoreErrorOptions {
  code: RestoreErrorCode;
  message: string;
  origin: RestoreErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class RestoreError extends Error {
  public readonly code: RestoreErrorCode;
  public readonly origin: RestoreErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: RestoreErrorOptions) {
    super(options.message);
    this.name = "RestoreError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RestoreError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<RestoreErrorOptions, "cause" | "message"> & { message?: string }
  ): RestoreError {
    if (err instanceof RestoreError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de restauración");
    return new RestoreError({ ...options, message, cause: err });
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

export function createRestoreError(options: RestoreErrorOptions): RestoreError {
  return new RestoreError(options);
}
