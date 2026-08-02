import type { WorkspaceManager } from "@dwm/workspace";
import type { ToolingManager } from "@dwm/tooling";
import type { AdapterManager } from "@dwm/adapters";
import type { AIManager } from "@dwm/ai-manager";
import type { SecretsManager } from "@dwm/secrets";
import { validateProfileConfiguration, type ProfileConfiguration } from "./ProfileConfiguration.js";
import { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
import { createProfileError } from "./errors/ProfileError.js";

export interface ProfileValidatorOptions {
  readonly workspaceManager?: WorkspaceManager;
  readonly toolingManager?: ToolingManager;
  readonly adapterManager?: AdapterManager;
  readonly aiManager?: AIManager;
  readonly secretsManager?: SecretsManager;
}

/**
 * Valida la coherencia semántica (no solo la forma) de una
 * `ProfileConfiguration`: que el workspace asociado, las herramientas y
 * adaptadores habilitados, el proveedor de IA por defecto y los secretos
 * referenciados existan realmente en los gestores correspondientes, si
 * están integrados. Cada comprobación es opcional: si un gestor no está
 * disponible, esa parte de la validación simplemente se omite.
 */
export class ProfileValidator {
  constructor(private readonly options: ProfileValidatorOptions = {}) {}

  async validate(configuration: ProfileConfiguration): Promise<void> {
    validateProfileConfiguration(configuration);

    if (configuration.workspaceId !== undefined && this.options.workspaceManager) {
      if (!this.options.workspaceManager.getWorkspace(configuration.workspaceId)) {
        throw createProfileError({
          code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
          message: `El workspace referenciado "${configuration.workspaceId}" no está abierto.`,
          origin: "validation",
          recoverable: true,
        });
      }
    }

    if (this.options.toolingManager) {
      for (const toolId of configuration.enabledTools) {
        if (this.options.toolingManager.getState(toolId) === undefined) {
          throw createProfileError({
            code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
            message: `La herramienta habilitada "${toolId}" no está registrada.`,
            origin: "validation",
            recoverable: true,
          });
        }
      }
    }

    if (this.options.adapterManager) {
      for (const adapterId of configuration.enabledAdapters) {
        if (this.options.adapterManager.getState(adapterId) === undefined) {
          throw createProfileError({
            code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
            message: `El adaptador habilitado "${adapterId}" no está registrado.`,
            origin: "validation",
            recoverable: true,
          });
        }
      }
    }

    if (configuration.defaultAIProviderId !== undefined && this.options.aiManager) {
      if (!this.options.aiManager.getConnection(configuration.defaultAIProviderId)) {
        throw createProfileError({
          code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
          message: `El proveedor de IA por defecto "${configuration.defaultAIProviderId}" no está registrado.`,
          origin: "validation",
          recoverable: true,
        });
      }
    }

    if (this.options.secretsManager) {
      for (const key of configuration.secretRefs) {
        if (!(await this.options.secretsManager.hasSecret(key))) {
          throw createProfileError({
            code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
            message: `El secreto referenciado "${key}" no existe.`,
            origin: "validation",
            recoverable: true,
          });
        }
      }
    }
  }
}
