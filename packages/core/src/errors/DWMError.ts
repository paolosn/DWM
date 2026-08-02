import { ErrorCode } from "./ErrorCodes.js";

export type ErrorOrigin =
  | "bootstrap"
  | "config"
  | "profile"
  | "lifecycle"
  | "registry-module"
  | "registry-adapter"
  | "event-bus"
  | "storage";

export interface DWMErrorOptions {
  code: ErrorCode;
  message: string;
  origin: ErrorOrigin;
  /** Si el Core puede continuar operando en modo degradado tras este error. */
  recoverable: boolean;
  cause?: unknown;
}

/**
 * Error canónico del sistema DWM (README §9). Toda excepción nativa que
 * atraviese una frontera del Core debe envolverse en esta clase antes de
 * propagarse o emitirse mediante el EventBus.
 */
export class DWMError extends Error {
  public readonly code: ErrorCode;
  public readonly origin: ErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: DWMErrorOptions) {
    super(options.message);
    this.name = "DWMError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    // Mantiene la traza de pila correcta en motores V8.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DWMError);
    }
  }

  /**
   * Envuelve cualquier valor lanzado (Error nativo u otro) en un DWMError,
   * preservando la causa original para diagnóstico.
   */
  static wrap(
    err: unknown,
    options: Omit<DWMErrorOptions, "cause" | "message"> & { message?: string }
  ): DWMError {
    if (err instanceof DWMError) {
      return err;
    }
    const message =
      options.message ?? (err instanceof Error ? err.message : "Error desconocido en el Core");
    return new DWMError({
      code: options.code,
      message,
      origin: options.origin,
      recoverable: options.recoverable,
      cause: err,
    });
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
