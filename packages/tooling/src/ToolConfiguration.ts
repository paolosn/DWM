import { ToolErrorCode } from "./errors/ToolErrorCode.js";
import { createToolError } from "./errors/ToolError.js";

export interface ToolConfiguration {
  readonly enabled: boolean;
  /** Prioridad de inicialización/activación entre herramientas independientes (mayor primero). */
  readonly priority: number;
  /** Ids de otras herramientas que deben inicializarse antes que esta. */
  readonly dependencies: readonly string[];
  /** Si se indica, solo una herramienta del mismo grupo puede estar activa a la vez (resolución de conflictos). */
  readonly exclusiveGroup?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
}

export function defaultToolConfiguration(): ToolConfiguration {
  return { enabled: true, priority: 0, dependencies: [] };
}

export function validateToolConfiguration(config: ToolConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createToolError({
      code: ToolErrorCode.TOOL_INVALID_CONFIGURATION,
      message: "ToolConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.enabled !== "boolean") {
    throw createToolError({
      code: ToolErrorCode.TOOL_INVALID_CONFIGURATION,
      message: "ToolConfiguration.enabled debe ser booleano.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.priority !== "number" || !Number.isFinite(config.priority)) {
    throw createToolError({
      code: ToolErrorCode.TOOL_INVALID_CONFIGURATION,
      message: "ToolConfiguration.priority debe ser un número finito.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (
    !Array.isArray(config.dependencies) ||
    config.dependencies.some((d) => typeof d !== "string")
  ) {
    throw createToolError({
      code: ToolErrorCode.TOOL_INVALID_CONFIGURATION,
      message: "ToolConfiguration.dependencies debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (config.exclusiveGroup !== undefined && typeof config.exclusiveGroup !== "string") {
    throw createToolError({
      code: ToolErrorCode.TOOL_INVALID_CONFIGURATION,
      message: "ToolConfiguration.exclusiveGroup debe ser una cadena si se indica.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
