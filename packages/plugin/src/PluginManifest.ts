import type { PluginDependency } from "./PluginDependency.js";
import type { PluginPermissionRequest } from "./PluginPermissions.js";
import type { PluginCapabilities } from "./PluginCapabilities.js";

/**
 * Manifiesto declarativo de un plugin: metadata autor-declarada e
 * inmutable. Nunca contiene código ejecutable; `entryPoint` es solo una
 * referencia simbólica que una `PluginFactory` (fuera de este módulo)
 * resuelve de forma segura, sin `eval` ni ejecución dinámica.
 */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly license?: string;
  readonly entryPoint: string;
  readonly minDwmVersion: string;
  readonly maxDwmVersion?: string;
  readonly dependencies: readonly PluginDependency[];
  /** Ids simbólicos de módulos/capacidades de DWM que el plugin necesita (ej. "workspace", "ai-manager"). */
  readonly moduleDependencies: readonly string[];
  readonly permissions: readonly PluginPermissionRequest[];
  readonly capabilities: PluginCapabilities;
  readonly defaultConfiguration?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
