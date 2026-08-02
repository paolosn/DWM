/** Catálogo cerrado de permisos que un plugin puede solicitar. */
export enum PluginPermission {
  CONFIG_READ = "config:read",
  CONFIG_WRITE = "config:write",
  SECRETS_READ = "secrets:read",
  WORKSPACE_ACCESS = "workspace:access",
  PROJECT_ACCESS = "project:access",
  TOOLS_USE = "tools:use",
  ADAPTERS_USE = "adapters:use",
  AI_USE = "ai:use",
  SCHEDULER_USE = "scheduler:use",
  EVENTS_EMIT = "events:emit",
  EVENTS_LISTEN = "events:listen",
  HOST_OPERATIONS = "host:operations",
}

export function isValidPluginPermission(value: unknown): value is PluginPermission {
  return (
    typeof value === "string" && Object.values(PluginPermission).includes(value as PluginPermission)
  );
}

/** Solicitud de permiso declarada en el manifiesto: distingue si es obligatorio para poder activarse. */
export interface PluginPermissionRequest {
  readonly permission: PluginPermission;
  readonly required: boolean;
}

/** Estado de concesión de un permiso solicitado: nunca se concede automáticamente. */
export type PluginPermissionState = "requested" | "granted" | "denied";
