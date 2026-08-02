import type { SchedulerErrorCode } from "./SchedulerErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `SchedulerError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/scheduler`, con su propio catálogo cerrado.
 */
export type SchedulerErrorOrigin = "task-options" | "cron" | "registry" | "execution" | "lifecycle";

export interface SchedulerErrorOptions {
  code: SchedulerErrorCode;
  message: string;
  origin: SchedulerErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class SchedulerError extends Error {
  public readonly code: SchedulerErrorCode;
  public readonly origin: SchedulerErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: SchedulerErrorOptions) {
    super(options.message);
    this.name = "SchedulerError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchedulerError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<SchedulerErrorOptions, "cause" | "message"> & { message?: string }
  ): SchedulerError {
    if (err instanceof SchedulerError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el planificador");
    return new SchedulerError({ ...options, message, cause: err });
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

export function createSchedulerError(options: SchedulerErrorOptions): SchedulerError {
  return new SchedulerError(options);
}
