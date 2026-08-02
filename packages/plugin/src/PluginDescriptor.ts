import type { PluginManifest } from "./PluginManifest.js";
import type { PluginMetadata } from "./PluginMetadata.js";
import type { PluginConfiguration } from "./PluginConfiguration.js";
import type { PluginState } from "./PluginState.js";
import type { PluginHealth } from "./PluginHealth.js";
import type { PluginPermission } from "./PluginPermissions.js";

/** Instantánea de solo lectura de un plugin registrado, para introspección. */
export interface PluginDescriptor {
  readonly manifest: PluginManifest;
  readonly metadata: PluginMetadata;
  readonly configuration: PluginConfiguration;
  readonly grantedPermissions: readonly PluginPermission[];
  readonly state: PluginState;
  readonly health?: PluginHealth;
}
