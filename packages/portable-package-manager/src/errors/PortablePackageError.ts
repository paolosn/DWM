import type { PortablePackageErrorCode } from "./PortablePackageErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `PortablePackageError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/portable-package-manager`, con su propio
 * catálogo cerrado.
 */
export type PortablePackageErrorOrigin =
  | "request"
  | "selection"
  | "builder"
  | "reader"
  | "extractor"
  | "validation"
  | "integrity"
  | "path"
  | "conflict"
  | "limits";

export interface PortablePackageErrorOptions {
  code: PortablePackageErrorCode;
  message: string;
  origin: PortablePackageErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class PortablePackageError extends Error {
  public readonly code: PortablePackageErrorCode;
  public readonly origin: PortablePackageErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: PortablePackageErrorOptions) {
    super(options.message);
    this.name = "PortablePackageError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PortablePackageError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<PortablePackageErrorOptions, "cause" | "message"> & { message?: string }
  ): PortablePackageError {
    if (err instanceof PortablePackageError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de paquetes portables");
    return new PortablePackageError({ ...options, message, cause: err });
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

export function createPortablePackageError(
  options: PortablePackageErrorOptions
): PortablePackageError {
  return new PortablePackageError(options);
}
