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
  /** Composición real del perfil (encargo, item 5 "kilo-content-integration"): ids reales de agentes/skills/reglas a materializar en el .kilo del proyecto al asignar este perfil. */
  readonly agentIds?: readonly string[];
  readonly skillIds?: readonly string[];
  readonly ruleIds?: readonly string[];
  /** Servidores MCP opcionales: ids de conexiones de tipo mcp-stdio/mcp-remote (@dwm/connections-manager) a asignar explícitamente al proyecto. */
  readonly mcpConnectionIds?: readonly string[];
  /** Color real del perfil (kit de trabajo visual), solo presentación — sin efecto funcional. */
  readonly color?: string;
  /** Alcance de origen real de agentIds/skillIds/ruleIds/mcpConnectionIds: un cliente concreto, o ausente = global. Los usa ProfileSyncController para resolver el mismo sourceRoot ya usado por ContentSyncController/ContentGenerationController — nunca un mecanismo nuevo. */
  readonly sourceClientId?: string;
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
  for (const field of ["agentIds", "skillIds", "ruleIds", "mcpConnectionIds"] as const) {
    const value = config[field];
    if (value !== undefined && !isStringArray(value)) {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
        message: `ProfileConfiguration.${field} debe ser un array de cadenas si se indica.`,
        origin: "configuration",
        recoverable: false,
      });
    }
  }
  for (const field of ["color", "sourceClientId"] as const) {
    const value = config[field];
    if (value !== undefined && typeof value !== "string") {
      throw createProfileError({
        code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION,
        message: `ProfileConfiguration.${field} debe ser una cadena si se indica.`,
        origin: "configuration",
        recoverable: false,
      });
    }
  }
}
