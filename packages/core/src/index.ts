// Núcleo
export { DWMCore, type BootstrapOptions } from "./core/DWMCore.js";
export { LifecycleState } from "./core/LifecycleState.js";
export type { ShutdownReport, ShutdownFailure } from "./core/ShutdownReport.js";

// Eventos
export {
  EventBus,
  type EventHandler,
  type UnsubscribeFn,
  type ScopedEventBus,
} from "./events/EventBus.js";
export type { CoreEventType, CoreEventPayloads } from "./events/EventTypes.js";

// Errores
export { DWMError, type DWMErrorOptions, type ErrorOrigin } from "./errors/DWMError.js";
export { ErrorCode } from "./errors/ErrorCodes.js";

// Estado
export { SystemStatus, type StatusRecord } from "./status/SystemStatus.js";
export { StateManager, type SystemSnapshot } from "./state/StateManager.js";

// Configuración
export { ConfigManager } from "./config/ConfigManager.js";
export { DEFAULT_CONFIG, type NormalizedConfig } from "./config/types.js";
export type { StorageProvider } from "./config/StorageProvider.js";
export { FileSystemStorageProvider } from "./config/FileSystemStorageProvider.js";

// Perfil
export { ProfileLoader } from "./profile/ProfileLoader.js";
export type { ProfileDescriptor } from "./profile/types.js";

// Registros
export {
  ModuleRegistry,
  MODULE_CONTRACT_VERSION,
  type ModuleDescriptor,
} from "./registry/ModuleRegistry.js";
export {
  AdapterRegistry,
  ADAPTER_CONTRACT_VERSION,
  type AdapterDescriptor,
} from "./registry/AdapterRegistry.js";
export { isValidSemver, isContractCompatible } from "./registry/validation.js";

// Contratos
export type { IModule, ModuleContext } from "./contracts/IModule.js";
export type { IAdapter } from "./contracts/IAdapter.js";
