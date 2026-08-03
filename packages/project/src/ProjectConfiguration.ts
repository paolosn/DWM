import { ProjectErrorCode } from "./errors/ProjectErrorCode.js";
import { createProjectError } from "./errors/ProjectError.js";

export interface ProjectConfiguration {
  readonly projectPath: string;
  /** Cada proyecto debe estar asociado a un único perfil. */
  readonly profileId: string;
  readonly workspaceId?: string;
  /** Cliente propietario del proyecto (`@dwm/client-manager`); ausente = "Sin cliente asignado" — un estado válido, no un error, para proyectos antiguos o creados sin cliente. */
  readonly clientId?: string;
  readonly usedTools: readonly string[];
  readonly usedAdapters: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateProjectConfiguration(config: ProjectConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.projectPath !== "string" || config.projectPath.length === 0) {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.projectPath es obligatorio y debe ser una cadena no vacía.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.profileId !== "string" || config.profileId.length === 0) {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.profileId es obligatorio y debe ser una cadena no vacía.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isStringArray(config.usedTools)) {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.usedTools debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isStringArray(config.usedAdapters)) {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.usedAdapters debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (config.workspaceId !== undefined && typeof config.workspaceId !== "string") {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.workspaceId debe ser una cadena si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (
    config.clientId !== undefined &&
    (typeof config.clientId !== "string" || config.clientId.length === 0)
  ) {
    throw createProjectError({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
      message: "ProjectConfiguration.clientId debe ser una cadena no vacía si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
