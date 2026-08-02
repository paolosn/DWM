import type { ProfileErrorCode } from "./ProfileErrorCode.js";

/**
 * `DWMError` tipa `code`/`origin` de forma cerrada al vocabulario del Core
 * (congelado). `ProfileError` reproduce la misma forma (`code`, `message`,
 * `origin`, `cause`, `recoverable`, `timestamp`, `toJSON()`) como clase
 * propia de `@dwm/profile`, con su propio catálogo cerrado.
 */
export type ProfileErrorOrigin =
  "configuration" | "registry" | "validation" | "persistence" | "lifecycle" | "import";

export interface ProfileErrorOptions {
  code: ProfileErrorCode;
  message: string;
  origin: ProfileErrorOrigin;
  recoverable: boolean;
  cause?: unknown;
}

export class ProfileError extends Error {
  public readonly code: ProfileErrorCode;
  public readonly origin: ProfileErrorOrigin;
  public readonly recoverable: boolean;
  public override readonly cause?: unknown;
  public readonly timestamp: string;

  constructor(options: ProfileErrorOptions) {
    super(options.message);
    this.name = "ProfileError";
    this.code = options.code;
    this.origin = options.origin;
    this.recoverable = options.recoverable;
    this.cause = options.cause;
    this.timestamp = new Date().toISOString();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ProfileError);
    }
  }

  static wrap(
    err: unknown,
    options: Omit<ProfileErrorOptions, "cause" | "message"> & { message?: string }
  ): ProfileError {
    if (err instanceof ProfileError) return err;
    const message =
      options.message ??
      (err instanceof Error ? err.message : "Error desconocido en el gestor de perfiles");
    return new ProfileError({ ...options, message, cause: err });
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

export function createProfileError(options: ProfileErrorOptions): ProfileError {
  return new ProfileError(options);
}
