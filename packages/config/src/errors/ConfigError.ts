import type { ConfigErrorCode } from "./ConfigErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ConfigError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/config`, con su propio catálogo cerrado.
 */
export type ConfigErrorOrigin = "configuration" | "namespace" | "persistence";

export interface ConfigErrorOptions {
  code: ConfigErrorCode;
  message: string;
  origin: ConfigErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ConfigError extends Error {
  public readonly code: ConfigErrorCode;
  public readonly origin: ConfigErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ConfigErrorOptions) {
    super(options.message);
    this.name = "ConfigError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ConfigErrorOptions, "cause" | "message"> & { message?: string }
  ): ConfigError {
    if (err instanceof ConfigError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en la configuración");
    return new ConfigError({ ...options, message, cause: err });
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

export function createConfigError(options: ConfigErrorOptions): ConfigError {
  return new ConfigError(options);
}
