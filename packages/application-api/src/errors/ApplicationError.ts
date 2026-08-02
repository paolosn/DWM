import type { ApplicationErrorCode } from "./ApplicationErrorCode.js";
import type { ApplicationErrorCategory } from "../ApplicationTypes.js";

/**
 * `ApplicationError` reproduce la misma forma que `DWMError` y el resto de
 * errores de dominio (`code`, `message`, `origin`, `cause`, `recoverable`,
 * `timestamp`, `toJSON()`), añadiendo `category` y `retryable`, que son los
 * campos que la Application API normaliza hacia el exterior a través de
 * `ApplicationErrorMapper`.
 */
export type ApplicationErrorOrigin =
  | "request"
  | "validation"
  | "permission"
  | "registry"
  | "router"
  | "operation"
  | "dependency"
  | "internal";

export interface ApplicationErrorOptions {
  code: ApplicationErrorCode;
  message: string;
  origin: ApplicationErrorOrigin;
  category: ApplicationErrorCategory;
  retryable: boolean;
  recoverable: boolean;
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

export class ApplicationError extends Error {
  public readonly code: ApplicationErrorCode;
  public readonly origin: ApplicationErrorOrigin;
  public readonly category: ApplicationErrorCategory;
  public readonly retryable: boolean;
  public readonly recoverable: boolean;
  public readonly details?: Readonly<Record<string, unknown>>;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ApplicationErrorOptions) {
    super(options.message);
    this.name = "ApplicationError";
    this.code = options.code;
    this.origin = options.origin;
    this.category = options.category;
    this.retryable = options.retryable;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();
    if (options.details) this.details = options.details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApplicationError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ApplicationErrorOptions, "cause" | "message"> & { message?: string }
  ): ApplicationError {
    if (err instanceof ApplicationError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en la Application API");
    return new ApplicationError({ ...options, message, cause: err });
  }

  /** Forma segura para exponer al exterior: nunca incluye `cause` ni stack. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      category: this.category,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function createApplicationError(options: ApplicationErrorOptions): ApplicationError {
  return new ApplicationError(options);
}
