import type { WorkspaceErrorCode } from "./WorkspaceErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `WorkspaceError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/portable-workspace`, con su propio catálogo
 * cerrado.
 */
export type WorkspaceErrorOrigin =
  | "request"
  | "registry"
  | "locator"
  | "initializer"
  | "validator"
  | "metadata"
  | "filesystem"
  | "persistence";

export interface WorkspaceErrorOptions {
  code: WorkspaceErrorCode;
  message: string;
  origin: WorkspaceErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class WorkspaceError extends Error {
  public readonly code: WorkspaceErrorCode;
  public readonly origin: WorkspaceErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: WorkspaceErrorOptions) {
    super(options.message);
    this.name = "WorkspaceError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkspaceError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<WorkspaceErrorOptions, "cause" | "message"> & { message?: string }
  ): WorkspaceError {
    if (err instanceof WorkspaceError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de workspace portable");
    return new WorkspaceError({ ...options, message, cause: err });
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

export function createWorkspaceError(options: WorkspaceErrorOptions): WorkspaceError {
  return new WorkspaceError(options);
}
