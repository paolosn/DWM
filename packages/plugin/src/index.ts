export type { PluginState } from "./PluginState.js";
export { isPluginStateTransitionAllowed } from "./PluginState.js";
export {
  PluginPermission,
  isValidPluginPermission,
  type PluginPermissionRequest,
  type PluginPermissionState,
} from "./PluginPermissions.js";
export type { PluginCapability, PluginCapabilities } from "./PluginCapabilities.js";
export { emptyPluginCapabilities } from "./PluginCapabilities.js";
export type { PluginDependency } from "./PluginDependency.js";
export type { PluginHealth, PluginHealthStatus } from "./PluginHealth.js";
export { makePluginHealth } from "./PluginHealth.js";
export type { PluginManifest } from "./PluginManifest.js";
export {
  checkPluginCompatibility,
  compareSemver,
  type PluginCompatibilityResult,
} from "./PluginCompatibility.js";
export type { PluginConfiguration } from "./PluginConfiguration.js";
export { defaultPluginConfiguration, validatePluginConfiguration } from "./PluginConfiguration.js";
export type { PluginMetadata } from "./PluginMetadata.js";
export { createInitialPluginMetadata, touchPluginMetadata } from "./PluginMetadata.js";
export type { PluginDescriptor } from "./PluginDescriptor.js";
export type { PluginContext } from "./PluginContext.js";
export { Plugin } from "./Plugin.js";
export type { PluginFactory } from "./PluginFactory.js";
export type { PluginSource } from "./PluginSource.js";
export { StaticPluginSource } from "./PluginSource.js";
export { PluginLoader } from "./PluginLoader.js";
export { PluginLifecycle } from "./PluginLifecycle.js";
export {
  PluginValidator,
  type PluginValidationIssue,
  type PluginValidationResult,
} from "./PluginValidator.js";
export { PluginRegistry, type PluginRecord } from "./PluginRegistry.js";
export { PluginStore, type PersistedPlugin } from "./PluginStore.js";
export {
  PluginManager,
  type PluginManagerOptions,
  type InstallPluginOptions,
  type UninstallPluginOptions,
  type DeactivatePluginOptions,
  type DiscoverPluginsResult,
} from "./PluginManager.js";

export {
  PluginError,
  createPluginError,
  type PluginErrorOptions,
  type PluginErrorOrigin,
} from "./errors/PluginError.js";
export { PluginErrorCode } from "./errors/PluginErrorCode.js";
