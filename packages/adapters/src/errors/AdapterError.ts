import type { AdapterErrorCode } from "./AdapterErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `AdapterError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/adapters`, con su propio catálogo cerrado.
 */
export type AdapterErrorOrigin = "configuration" | "registry" | "lifecycle" | "health-check";

export interface AdapterErrorOptions {
  code: AdapterErrorCode;
  message: string;
  origin: AdapterErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class AdapterError extends Error {
  public readonly code: AdapterErrorCode;
  public readonly origin: AdapterErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: AdapterErrorOptions) {
    super(options.message);
    this.name = "AdapterError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AdapterError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<AdapterErrorOptions, "cause" | "message"> & { message?: string }
  ): AdapterError {
    if (err instanceof AdapterError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de adaptadores");
    return new AdapterError({ ...options, message, cause: err });
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

export function createAdapterError(options: AdapterErrorOptions): AdapterError {
  return new AdapterError(options);
}
