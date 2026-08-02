import type { DeliveryErrorCode } from "./DeliveryErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `DeliveryError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/delivery-manager`, con su propio catálogo cerrado.
 */
export type DeliveryErrorOrigin =
  | "request"
  | "id"
  | "label"
  | "project"
  | "source"
  | "repository"
  | "history"
  | "validation"
  | "lifecycle"
  | "path"
  | "import"
  | "integrity";

export interface DeliveryErrorOptions {
  code: DeliveryErrorCode;
  message: string;
  origin: DeliveryErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class DeliveryError extends Error {
  public readonly code: DeliveryErrorCode;
  public readonly origin: DeliveryErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: DeliveryErrorOptions) {
    super(options.message);
    this.name = "DeliveryError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeliveryError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<DeliveryErrorOptions, "cause" | "message"> & { message?: string }
  ): DeliveryError {
    if (err instanceof DeliveryError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de entregas");
    return new DeliveryError({ ...options, message, cause: err });
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

export function createDeliveryError(options: DeliveryErrorOptions): DeliveryError {
  return new DeliveryError(options);
}
