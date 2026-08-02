import type { ToolErrorCode } from "./ToolErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ToolError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/tooling`, con su propio catálogo cerrado.
 */
export type ToolErrorOrigin =
  "configuration" | "registry" | "lifecycle" | "health-check" | "compatibility";

export interface ToolErrorOptions {
  code: ToolErrorCode;
  message: string;
  origin: ToolErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ToolError extends Error {
  public readonly code: ToolErrorCode;
  public readonly origin: ToolErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ToolErrorOptions) {
    super(options.message);
    this.name = "ToolError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ToolError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ToolErrorOptions, "cause" | "message"> & { message?: string }
  ): ToolError {
    if (err instanceof ToolError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de herramientas");
    return new ToolError({ ...options, message, cause: err });
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

export function createToolError(options: ToolErrorOptions): ToolError {
  return new ToolError(options);
}
