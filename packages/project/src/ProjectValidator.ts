import type { WorkspaceManager } from "@dwm/workspace";
import type { ToolingManager } from "@dwm/tooling";
import type { AdapterManager } from "@dwm/adapters";
import type { ProfileManager } from "@dwm/profile";
import { validateProjectConfiguration, type ProjectConfiguration } from "./ProjectConfiguration.js";
import { ProjectErrorCode } from "./errors/ProjectErrorCode.js";
import { createProjectError } from "./errors/ProjectError.js";

export interface ProjectValidatorOptions {
  readonly workspaceManager?: WorkspaceManager;
  readonly toolingManager?: ToolingManager;
  readonly adapterManager?: AdapterManager;
  readonly profileManager?: ProfileManager;
}

/**
 * Valida la coherencia semántica (no solo la forma) de una
 * `ProjectConfiguration`: que el perfil asociado (obligatorio), el
 * workspace asociado (si se indica) y las herramientas/adaptadores
 * utilizados existan realmente en los gestores correspondientes, si están
 * integrados. Cada comprobación es opcional: si un gestor no está
 * disponible, esa parte de la validación simplemente se omite.
 */
export class ProjectValidator {
  constructor(private readonly options: ProjectValidatorOptions = {}) {}

  async validate(configuration: ProjectConfiguration): Promise<void> {
    validateProjectConfiguration(configuration);

    if (
      this.options.profileManager &&
      !this.options.profileManager.getProfile(configuration.profileId)
    ) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
        message: `El perfil asociado "${configuration.profileId}" no está registrado.`,
        origin: "validation",
        recoverable: true,
      });
    }

    if (configuration.workspaceId !== undefined && this.options.workspaceManager) {
      if (!this.options.workspaceManager.getWorkspace(configuration.workspaceId)) {
        throw createProjectError({
          code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
          message: `El workspace referenciado "${configuration.workspaceId}" no está abierto.`,
          origin: "validation",
          recoverable: true,
        });
      }
    }

    if (this.options.toolingManager) {
      for (const toolId of configuration.usedTools) {
        if (this.options.toolingManager.getState(toolId) === undefined) {
          throw createProjectError({
            code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
            message: `La herramienta utilizada "${toolId}" no está registrada.`,
            origin: "validation",
            recoverable: true,
          });
        }
      }
    }

    if (this.options.adapterManager) {
      for (const adapterId of configuration.usedAdapters) {
        if (this.options.adapterManager.getState(adapterId) === undefined) {
          throw createProjectError({
            code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
            message: `El adaptador utilizado "${adapterId}" no está registrado.`,
            origin: "validation",
            recoverable: true,
          });
        }
      }
    }
  }
}
