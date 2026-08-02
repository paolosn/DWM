export { AdapterSubject, isValidAdapterSubject } from "./AdapterSubject.js";
export type { AdapterState } from "./AdapterState.js";
export { isStateTransitionAllowed } from "./AdapterState.js";
export type { AdapterCapability, AdapterCapabilities } from "./AdapterCapabilities.js";
export { emptyCapabilities } from "./AdapterCapabilities.js";
export type { AdapterHealth } from "./AdapterHealth.js";
export { makeHealth } from "./AdapterHealth.js";
export type { AdapterConfiguration } from "./AdapterConfiguration.js";
export {
  defaultAdapterConfiguration,
  validateAdapterConfiguration,
} from "./AdapterConfiguration.js";
export type { AdapterContext } from "./AdapterContext.js";
export { BaseAdapter } from "./BaseAdapter.js";
export type { AdapterFactory } from "./AdapterFactory.js";
export { AdapterRegistry, type AdapterRecord } from "./AdapterRegistry.js";
export { AdapterManager, type AdapterManagerOptions } from "./AdapterManager.js";

export {
  AdapterError,
  createAdapterError,
  type AdapterErrorOptions,
  type AdapterErrorOrigin,
} from "./errors/AdapterError.js";
export { AdapterErrorCode } from "./errors/AdapterErrorCode.js";
