import type { PSNErrorCode } from "./PSNErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `PSNError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/psn-adapter`, con su propio catálogo cerrado.
 */
export type PSNErrorOrigin = "request" | "root" | "scan" | "registry" | "resource";

export interface PSNErrorOptions {
  code: PSNErrorCode;
  message: string;
  origin: PSNErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class PSNError extends Error {
  public readonly code: PSNErrorCode;
  public readonly origin: PSNErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: PSNErrorOptions) {
    super(options.message);
    this.name = "PSNError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PSNError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<PSNErrorOptions, "cause" | "message"> & { message?: string }
  ): PSNError {
    if (err instanceof PSNError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el adaptador PSN");
    return new PSNError({ ...options, message, cause: err });
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

export function createPSNError(options: PSNErrorOptions): PSNError {
  return new PSNError(options);
}
