export type PluginHealthStatus = "healthy" | "degraded" | "unavailable" | "failed";

export interface PluginHealth {
  readonly pluginId: string;
  readonly status: PluginHealthStatus;
  readonly checkedAt: string;
  readonly detail?: string;
}

export function makePluginHealth(
  pluginId: string,
  status: PluginHealthStatus,
  detail?: string
): PluginHealth {
  return {
    pluginId,
    status,
    checkedAt: new Date().toISOString(),
    ...(detail !== undefined ? { detail } : {}),
  };
}
