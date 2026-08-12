import type { RequirementErrorCode } from "./RequirementErrorCode.js";

export type RequirementErrorOrigin = "request" | "id" | "repository" | "validation" | "lifecycle";

export interface RequirementErrorOptions {
  code: RequirementErrorCode;
  message: string;
  origin: RequirementErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class RequirementError extends Error {
  public readonly code: RequirementErrorCode;
  public readonly origin: RequirementErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: RequirementErrorOptions) {
    super(options.message);
    this.name = "RequirementError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RequirementError);
    }
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

export function createRequirementError(options: RequirementErrorOptions): RequirementError {
  return new RequirementError(options);
}
