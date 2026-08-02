import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

export interface WorkspaceConfiguration {
  /** Patrones glob (soporta "*" y "**") de rutas relativas a excluir del escaneo. */
  readonly excludePatterns: readonly string[];
  /** Si es `true`, se detectan cambios periódicamente y se recarga el índice automáticamente. */
  readonly autoReload: boolean;
  /** Intervalo, en milisegundos, entre comprobaciones de cambios cuando `autoReload` está activo. */
  readonly scanIntervalMs: number;
}

export const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = [
  ".dwm-workspace/**",
  "node_modules/**",
  "dist/**",
  "coverage/**",
  ".git/**",
];

export function defaultWorkspaceConfiguration(): WorkspaceConfiguration {
  return {
    excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
    autoReload: false,
    scanIntervalMs: 60_000,
  };
}

export function validateWorkspaceConfiguration(config: WorkspaceConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION,
      message: "WorkspaceConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!Array.isArray(config.excludePatterns)) {
    throw createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION,
      message: "WorkspaceConfiguration.excludePatterns debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.autoReload !== "boolean") {
    throw createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION,
      message: "WorkspaceConfiguration.autoReload debe ser booleano.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.scanIntervalMs !== "number" || config.scanIntervalMs <= 0) {
    throw createWorkspaceError({
      code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION,
      message: "WorkspaceConfiguration.scanIntervalMs debe ser un número > 0.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
