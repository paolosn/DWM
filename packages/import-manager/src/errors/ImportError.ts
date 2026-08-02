import type { ImportErrorCode } from "./ImportErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ImportError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/import-manager`, con su propio catálogo cerrado.
 */
export type ImportErrorOrigin =
  | "request"
  | "registry"
  | "source"
  | "destination"
  | "scan"
  | "copy"
  | "validation"
  | "lifecycle"
  | "rollback"
  | "persistence"
  | "concurrency";

export interface ImportErrorOptions {
  code: ImportErrorCode;
  message: string;
  origin: ImportErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ImportError extends Error {
  public readonly code: ImportErrorCode;
  public readonly origin: ImportErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ImportErrorOptions) {
    super(options.message);
    this.name = "ImportError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ImportError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ImportErrorOptions, "cause" | "message"> & { message?: string }
  ): ImportError {
    if (err instanceof ImportError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de importación");
    return new ImportError({ ...options, message, cause: err });
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

export function createImportError(options: ImportErrorOptions): ImportError {
  return new ImportError(options);
}
