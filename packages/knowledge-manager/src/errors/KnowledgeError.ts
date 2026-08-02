import type { KnowledgeErrorCode } from "./KnowledgeErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `KnowledgeError` reproduce la misma forma (`code`,
 * `message`, `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`)
 * como clase propia de `@dwm/knowledge-manager`, con su propio catálogo
 * cerrado.
 */
export type KnowledgeErrorOrigin =
  | "request"
  | "id"
  | "directory"
  | "repository"
  | "registry"
  | "validation"
  | "lifecycle"
  | "path"
  | "relation";

export interface KnowledgeErrorOptions {
  code: KnowledgeErrorCode;
  message: string;
  origin: KnowledgeErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class KnowledgeError extends Error {
  public readonly code: KnowledgeErrorCode;
  public readonly origin: KnowledgeErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: KnowledgeErrorOptions) {
    super(options.message);
    this.name = "KnowledgeError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KnowledgeError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<KnowledgeErrorOptions, "cause" | "message"> & { message?: string }
  ): KnowledgeError {
    if (err instanceof KnowledgeError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de conocimiento");
    return new KnowledgeError({ ...options, message, cause: err });
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

export function createKnowledgeError(options: KnowledgeErrorOptions): KnowledgeError {
  return new KnowledgeError(options);
}
