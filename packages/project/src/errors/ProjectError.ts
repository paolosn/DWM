import type { ProjectErrorCode } from "./ProjectErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ProjectError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/project`, con su propio catálogo cerrado.
 */
export type ProjectErrorOrigin =
  "configuration" | "registry" | "validation" | "persistence" | "lifecycle" | "import";

export interface ProjectErrorOptions {
  code: ProjectErrorCode;
  message: string;
  origin: ProjectErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ProjectError extends Error {
  public readonly code: ProjectErrorCode;
  public readonly origin: ProjectErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ProjectErrorOptions) {
    super(options.message);
    this.name = "ProjectError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProjectError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ProjectErrorOptions, "cause" | "message"> & { message?: string }
  ): ProjectError {
    if (err instanceof ProjectError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de proyectos");
    return new ProjectError({ ...options, message, cause: err });
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

export function createProjectError(options: ProjectErrorOptions): ProjectError {
  return new ProjectError(options);
}
