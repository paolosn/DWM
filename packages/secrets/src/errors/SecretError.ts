import type { SecretErrorCode } from "./SecretErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `SecretError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/secrets`, con su propio catálogo cerrado. `toJSON()`
 * nunca incluye el valor de ningún secreto: solo la clave y metadatos
 * declarativos, nunca el contenido sensible.
 */
export type SecretErrorOrigin =
  "configuration" | "key" | "value" | "crypto" | "persistence" | "import";

export interface SecretErrorOptions {
  code: SecretErrorCode;
  message: string;
  origin: SecretErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class SecretError extends Error {
  public readonly code: SecretErrorCode;
  public readonly origin: SecretErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: SecretErrorOptions) {
    super(options.message);
    this.name = "SecretError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SecretError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<SecretErrorOptions, "cause" | "message"> & { message?: string }
  ): SecretError {
    if (err instanceof SecretError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en la gestión de secretos");
    return new SecretError({ ...options, message, cause: err });
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

export function createSecretError(options: SecretErrorOptions): SecretError {
  return new SecretError(options);
}
