import type { AIErrorCode } from "./AIErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `AIError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/ai-manager`, con su propio catálogo cerrado.
 */
export type AIErrorOrigin =
  "configuration" | "registry" | "credential" | "request" | "health-check";

export interface AIErrorOptions {
  code: AIErrorCode;
  message: string;
  origin: AIErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class AIError extends Error {
  public readonly code: AIErrorCode;
  public readonly origin: AIErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: AIErrorOptions) {
    super(options.message);
    this.name = "AIError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AIError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<AIErrorOptions, "cause" | "message"> & { message?: string }
  ): AIError {
    if (err instanceof AIError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de IA");
    return new AIError({ ...options, message, cause: err });
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

export function createAIError(options: AIErrorOptions): AIError {
  return new AIError(options);
}
