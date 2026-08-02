import type { CreationErrorCode } from "./CreationErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `CreationError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/ai-creator-manager`, con su propio catálogo cerrado.
 */
export type CreationErrorOrigin =
  | "request"
  | "kind"
  | "id"
  | "validation"
  | "dependency"
  | "template"
  | "prompt"
  | "provider"
  | "conflict"
  | "registry"
  | "pipeline"
  | "execution"
  | "cancellation";

export interface CreationErrorOptions {
  code: CreationErrorCode;
  message: string;
  origin: CreationErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class CreationError extends Error {
  public readonly code: CreationErrorCode;
  public readonly origin: CreationErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: CreationErrorOptions) {
    super(options.message);
    this.name = "CreationError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CreationError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<CreationErrorOptions, "cause" | "message"> & { message?: string }
  ): CreationError {
    if (err instanceof CreationError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de creación por IA");
    return new CreationError({ ...options, message, cause: err });
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

export function createCreationError(options: CreationErrorOptions): CreationError {
  return new CreationError(options);
}

/** Verdadero si `err` es un error de "no encontrado" de cualquier módulo DWM (código terminado en `_NOT_FOUND`), para tratar referencias ausentes sin duplicar el catálogo de cada manager. */
export function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.endsWith("_NOT_FOUND")
  );
}
