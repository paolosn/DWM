import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { createPluginError } from "./errors/PluginError.js";

export interface PluginConfiguration {
  readonly enabled: boolean;
  readonly priority: number;
  readonly settings: Readonly<Record<string, unknown>>;
}

export function defaultPluginConfiguration(
  defaults?: Readonly<Record<string, unknown>>
): PluginConfiguration {
  return { enabled: true, priority: 0, settings: { ...defaults } };
}

export function validatePluginConfiguration(config: PluginConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createPluginError({
      code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
      message: "PluginConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.enabled !== "boolean") {
    throw createPluginError({
      code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
      message: "PluginConfiguration.enabled debe ser booleano.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.priority !== "number" || !Number.isFinite(config.priority)) {
    throw createPluginError({
      code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
      message: "PluginConfiguration.priority debe ser un número finito.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!config.settings || typeof config.settings !== "object" || Array.isArray(config.settings)) {
    throw createPluginError({
      code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
      message: "PluginConfiguration.settings debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
