import type { BackupErrorCode } from "./BackupErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `BackupError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/backup`, con su propio catálogo cerrado.
 */
export type BackupErrorOrigin =
  | "request"
  | "registry"
  | "resource"
  | "target"
  | "lifecycle"
  | "chain"
  | "provider"
  | "verification"
  | "retention"
  | "persistence"
  | "concurrency";

export interface BackupErrorOptions {
  code: BackupErrorCode;
  message: string;
  origin: BackupErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class BackupError extends Error {
  public readonly code: BackupErrorCode;
  public readonly origin: BackupErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: BackupErrorOptions) {
    super(options.message);
    this.name = "BackupError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BackupError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<BackupErrorOptions, "cause" | "message"> & { message?: string }
  ): BackupError {
    if (err instanceof BackupError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de backups");
    return new BackupError({ ...options, message, cause: err });
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

export function createBackupError(options: BackupErrorOptions): BackupError {
  return new BackupError(options);
}
