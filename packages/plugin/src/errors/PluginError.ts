import type { PluginErrorCode } from "./PluginErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `PluginError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/plugin`, con su propio catálogo cerrado.
 */
export type PluginErrorOrigin =
  | "manifest"
  | "registry"
  | "compatibility"
  | "dependency"
  | "permission"
  | "lifecycle"
  | "configuration"
  | "persistence"
  | "health-check"
  | "concurrency";

export interface PluginErrorOptions {
  code: PluginErrorCode;
  message: string;
  origin: PluginErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class PluginError extends Error {
  public readonly code: PluginErrorCode;
  public readonly origin: PluginErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: PluginErrorOptions) {
    super(options.message);
    this.name = "PluginError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<PluginErrorOptions, "cause" | "message"> & { message?: string }
  ): PluginError {
    if (err instanceof PluginError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de plugins");
    return new PluginError({ ...options, message, cause: err });
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

export function createPluginError(options: PluginErrorOptions): PluginError {
  return new PluginError(options);
}
