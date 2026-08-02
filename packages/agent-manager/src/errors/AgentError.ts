import type { AgentErrorCode } from "./AgentErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `AgentError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/agent-manager`, con su propio catálogo cerrado.
 */
export type AgentErrorOrigin =
  "request" | "id" | "directory" | "repository" | "registry" | "validation" | "lifecycle";

export interface AgentErrorOptions {
  code: AgentErrorCode;
  message: string;
  origin: AgentErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class AgentError extends Error {
  public readonly code: AgentErrorCode;
  public readonly origin: AgentErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: AgentErrorOptions) {
    super(options.message);
    this.name = "AgentError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<AgentErrorOptions, "cause" | "message"> & { message?: string }
  ): AgentError {
    if (err instanceof AgentError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de agentes");
    return new AgentError({ ...options, message, cause: err });
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

export function createAgentError(options: AgentErrorOptions): AgentError {
  return new AgentError(options);
}
