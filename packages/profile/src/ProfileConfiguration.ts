import { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
import { createProfileError } from "./errors/ProfileError.js";

export interface ProfileConfiguration {
  readonly workspaceId?: string;
  readonly enabledTools: readonly string[];
  readonly enabledAdapters: readonly string[];
  readonly defaultAIProviderId?: string;
  readonly aiProviderConfiguration?: Readonly<Record<string, unknown>>;
  /** Claves de @dwm/secrets referenciadas por este perfil; nunca el valor del secreto. */
  readonly secretRefs: readonly string[];
  readonly preferences?: Readonly<Record<string, unknown>>;
}

export function defaultProfileConfiguration(): ProfileConfiguration {
  return { enabledTools: [], enabledAdapters: [], secretRefs: [] };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateProfileConfiguration(config: ProfileConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isStringArray(config.enabledTools)) {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration.enabledTools debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isStringArray(config.enabledAdapters)) {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration.enabledAdapters debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isStringArray(config.secretRefs)) {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration.secretRefs debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (config.workspaceId !== undefined && typeof config.workspaceId !== "string") {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration.workspaceId debe ser una cadena si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (config.defaultAIProviderId !== undefined && typeof config.defaultAIProviderId !== "string") {
    throw createProfileError({
      code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
      message: "ProfileConfiguration.defaultAIProviderId debe ser una cadena si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
