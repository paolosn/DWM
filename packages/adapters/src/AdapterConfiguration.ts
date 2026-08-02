import { AdapterErrorCode } from "./errors/AdapterErrorCode.js";
import { createAdapterError } from "./errors/AdapterError.js";

export interface AdapterConfiguration {
  readonly enabled: boolean;
  /** Prioridad de inicialización/activación entre adaptadores independientes (mayor primero). */
  readonly priority: number;
  /** Ids de otros adaptadores que deben inicializarse antes que este. */
  readonly dependencies: readonly string[];
  readonly settings?: Readonly<Record<string, unknown>>;
}

export function defaultAdapterConfiguration(): AdapterConfiguration {
  return { enabled: true, priority: 0, dependencies: [] };
}

export function validateAdapterConfiguration(config: AdapterConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createAdapterError({
      code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION,
      message: "AdapterConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.enabled !== "boolean") {
    throw createAdapterError({
      code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION,
      message: "AdapterConfiguration.enabled debe ser booleano.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.priority !== "number" || !Number.isFinite(config.priority)) {
    throw createAdapterError({
      code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION,
      message: "AdapterConfiguration.priority debe ser un número finito.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (
    !Array.isArray(config.dependencies) ||
    config.dependencies.some((d) => typeof d !== "string")
  ) {
    throw createAdapterError({
      code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION,
      message: "AdapterConfiguration.dependencies debe ser un array de cadenas.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
