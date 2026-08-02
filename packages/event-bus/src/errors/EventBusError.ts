import type { EventBusErrorCode } from "./EventBusErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `EventBusError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/event-bus`, con su propio catálogo cerrado.
 */
export type EventBusErrorOrigin = "subscription" | "dispatch" | "middleware";

export interface EventBusErrorOptions {
  code: EventBusErrorCode;
  message: string;
  origin: EventBusErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class EventBusError extends Error {
  public readonly code: EventBusErrorCode;
  public readonly origin: EventBusErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: EventBusErrorOptions) {
    super(options.message);
    this.name = "EventBusError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventBusError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<EventBusErrorOptions, "cause" | "message"> & { message?: string }
  ): EventBusError {
    if (err instanceof EventBusError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el bus de eventos");
    return new EventBusError({ ...options, message, cause: err });
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

export function createEventBusError(options: EventBusErrorOptions): EventBusError {
  return new EventBusError(options);
}
