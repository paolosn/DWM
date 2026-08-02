import type { MigrationErrorCode } from "./MigrationErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `MigrationError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/migration`, con su propio catálogo cerrado.
 */
export type MigrationErrorOrigin =
  | "request"
  | "registry"
  | "backup"
  | "restore"
  | "compatibility"
  | "conflict"
  | "lifecycle"
  | "persistence"
  | "concurrency";

export interface MigrationErrorOptions {
  code: MigrationErrorCode;
  message: string;
  origin: MigrationErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class MigrationError extends Error {
  public readonly code: MigrationErrorCode;
  public readonly origin: MigrationErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: MigrationErrorOptions) {
    super(options.message);
    this.name = "MigrationError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MigrationError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<MigrationErrorOptions, "cause" | "message"> & { message?: string }
  ): MigrationError {
    if (err instanceof MigrationError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de migraciones");
    return new MigrationError({ ...options, message, cause: err });
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

export function createMigrationError(options: MigrationErrorOptions): MigrationError {
  return new MigrationError(options);
}
