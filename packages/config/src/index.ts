export { ConfigManager, type ConfigManagerOptions } from "./ConfigManager.js";
export { ConfigStore } from "./ConfigStore.js";
export { assertValidNamespace } from "./namespace.js";

export {
  ConfigError,
  createConfigError,
  type ConfigErrorOptions,
  type ConfigErrorOrigin,
} from "./errors/ConfigError.js";
export { ConfigErrorCode } from "./errors/ConfigErrorCode.js";
