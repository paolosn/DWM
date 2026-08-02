import type { VerificationErrorCode } from "./VerificationErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `VerificationError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/verification`, con su propio catálogo cerrado.
 */
export type VerificationErrorOrigin =
  "request" | "registry" | "lifecycle" | "check" | "persistence" | "concurrency";

export interface VerificationErrorOptions {
  code: VerificationErrorCode;
  message: string;
  origin: VerificationErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class VerificationError extends Error {
  public readonly code: VerificationErrorCode;
  public readonly origin: VerificationErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: VerificationErrorOptions) {
    super(options.message);
    this.name = "VerificationError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VerificationError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<VerificationErrorOptions, "cause" | "message"> & { message?: string }
  ): VerificationError {
    if (err instanceof VerificationError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de verificación");
    return new VerificationError({ ...options, message, cause: err });
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

export function createVerificationError(options: VerificationErrorOptions): VerificationError {
  return new VerificationError(options);
}
