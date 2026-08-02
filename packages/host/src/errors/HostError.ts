import type { HostErrorCode } from "./HostErrorCatalog.js";

/**
 * `DWMError` (el tipo de error canónico del Core, ADR-002 §7) tipa `code`
 * como el `ErrorCode` cerrado del propio Core y `origin` como un conjunto
 * cerrado de subsistemas del propio Core. Ninguno de los dos admite los
 * códigos `HOST_*` ni los orígenes propios de la capa host sin forzar el
 * tipo, y el Core está congelado: no puede ampliarse para admitirlos.
 *
 * `HostError` reproduce exactamente la misma forma que `DWMError`
 * (`code`, `message`, `origin`, `cause`, `recoverable`, `timestamp`,
 * `toJSON()`) para cumplir en espíritu el principio de "un único tipo de
 * error canónico" (ADR-002 §7, TDS-001 §9.1), pero como una clase propia de
 * `@dwm/host` con su propio catálogo cerrado (`HostErrorCode`) y su propio
 * conjunto cerrado de orígenes, en vez de forzar tipos ajenos al Core
 * mediante aserciones inseguras.
 */
export type HostErrorOrigin =
  | "configuration"
  | "manifest"
  | "composition"
  | "core-bridge"
  | "construction"
  | "registration"
  | "use-case"
  | "rollback"
  | "shutdown"
  | "state";

export interface HostErrorOptions {
  code: HostErrorCode;
  message: string;
  origin: HostErrorOrigin;
  /** Si el host puede continuar en modo degradado tras este error. */
  recoverable: boolean;
  cause?: unknown;
}

export class HostError extends Error {
  public readonly code: HostErrorCode;
  public readonly origin: HostErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: HostErrorOptions) {
    super(options.message);
    this.name = "HostError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HostError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<HostErrorOptions, "cause" | "message"> & { message?: string }
  ): HostError {
    if (err instanceof HostError) {
      return err;
    }
    const message =
      options.message ?? (err instanceof Error ? err.message : "Error desconocido en la capa host");
    return new HostError({
      code: options.code,
      message,
      origin: options.origin,
      recoverable: options.recoverable,
      cause: err,
    });
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

export function createHostError(options: HostErrorOptions): HostError {
  return new HostError(options);
}
