import type { ConnectionErrorCode } from "./ConnectionErrorCode.js";

/**
 * `ConnectionError` reproduce la misma forma que `DeliveryError` /
 * `SecretError` (`code`, `message`, `origin`, `cause`, `recoverable`,
 * `timestamp`, `toJSON()`), con su propio catálogo cerrado. `toJSON()` y
 * `message` nunca incluyen valores de secreto (README "Seguridad"): quien
 * construye el error es responsable de pasar un `message` ya redactado.
 */
export type ConnectionErrorOrigin =
  | "request"
  | "id"
  | "name"
  | "type"
  | "project"
  | "repository"
  | "profile"
  | "capability"
  | "adapter"
  | "mcp"
  | "secret"
  | "test"
  | "path";

export interface ConnectionErrorOptions {
  code: ConnectionErrorCode;
  message: string;
  origin: ConnectionErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ConnectionError extends Error {
  public readonly code: ConnectionErrorCode;
  public readonly origin: ConnectionErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ConnectionErrorOptions) {
    super(options.message);
    this.name = "ConnectionError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConnectionError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ConnectionErrorOptions, "cause" | "message"> & { message?: string }
  ): ConnectionError {
    if (err instanceof ConnectionError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de conexiones");
    return new ConnectionError({ ...options, message, cause: err });
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

export function createConnectionError(options: ConnectionErrorOptions): ConnectionError {
  return new ConnectionError(options);
}
