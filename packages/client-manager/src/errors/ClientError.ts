import type { ClientErrorCode } from "./ClientErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ClientError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/client-manager`, con su propio catálogo cerrado.
 */
export type ClientErrorOrigin =
  | "request"
  | "id"
  | "slug"
  | "directory"
  | "repository"
  | "registry"
  | "validation"
  | "lifecycle"
  | "path"
  | "relation";

export interface ClientErrorOptions {
  code: ClientErrorCode;
  message: string;
  origin: ClientErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ClientError extends Error {
  public readonly code: ClientErrorCode;
  public readonly origin: ClientErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ClientErrorOptions) {
    super(options.message);
    this.name = "ClientError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ClientError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ClientErrorOptions, "cause" | "message"> & { message?: string }
  ): ClientError {
    if (err instanceof ClientError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de clientes");
    return new ClientError({ ...options, message, cause: err });
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

export function createClientError(options: ClientErrorOptions): ClientError {
  return new ClientError(options);
}
