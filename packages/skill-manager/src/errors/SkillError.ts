import type { SkillErrorCode } from "./SkillErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `SkillError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/skill-manager`, con su propio catálogo cerrado.
 */
export type SkillErrorOrigin =
  "request" | "id" | "directory" | "repository" | "registry" | "validation" | "lifecycle" | "path";

export interface SkillErrorOptions {
  code: SkillErrorCode;
  message: string;
  origin: SkillErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class SkillError extends Error {
  public readonly code: SkillErrorCode;
  public readonly origin: SkillErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: SkillErrorOptions) {
    super(options.message);
    this.name = "SkillError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SkillError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<SkillErrorOptions, "cause" | "message"> & { message?: string }
  ): SkillError {
    if (err instanceof SkillError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de skills");
    return new SkillError({ ...options, message, cause: err });
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

export function createSkillError(options: SkillErrorOptions): SkillError {
  return new SkillError(options);
}
