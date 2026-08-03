import type { ProjectProvisioningErrorCode } from "./ProjectProvisioningErrorCode.js";

export type ProjectProvisioningErrorOrigin =
  "request" | "psn-base" | "profile" | "path" | "copy" | "rollback" | "client" | "project";

export interface ProjectProvisioningErrorOptions {
  code: ProjectProvisioningErrorCode;
  message: string;
  origin: ProjectProvisioningErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ProjectProvisioningError extends Error {
  public readonly code: ProjectProvisioningErrorCode;
  public readonly origin: ProjectProvisioningErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ProjectProvisioningErrorOptions) {
    super(options.message);
    this.name = "ProjectProvisioningError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();
    if (Error.captureStackTrace) Error.captureStackTrace(this, ProjectProvisioningError);
  }

  static wrap(
    err: unknown,
    options: Omit<ProjectProvisioningErrorOptions, "cause" | "message"> & { message?: string }
  ): ProjectProvisioningError {
    if (err instanceof ProjectProvisioningError) return err;
    const message =
      options.message ??
      (err instanceof Error
        ? err.message
        : "Error desconocido en el aprovisionamiento de proyectos.");
    return new ProjectProvisioningError({ ...options, message, cause: err });
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

export function createProjectProvisioningError(
  options: ProjectProvisioningErrorOptions
): ProjectProvisioningError {
  return new ProjectProvisioningError(options);
}
