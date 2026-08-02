// Host
export {
  ApplicationHost,
  type HostStatusView,
  type CoreStatusView,
} from "./host/ApplicationHost.js";
export { HostLifecycleState } from "./host/HostLifecycleState.js";

// Configuración
export type {
  HostConfiguration,
  ComponentDescriptor,
  UseCaseDescriptor,
} from "./config/HostConfiguration.js";

// Manifiestos
export type {
  ComponentManifest,
  ComponentKind,
  ProvidedCapability,
  RequiredCapability,
} from "./manifests/ComponentManifest.js";

// Fábricas y bundles
export type {
  ComponentFactory,
  ModuleFactory,
  AdapterFactory,
} from "./factories/ComponentFactory.js";
export type { ComponentBundle, LifecycleInstance } from "./bundles/ComponentBundle.js";

// Dependencias externas
export type {
  HostStorage,
  Clock,
  IdGenerator,
  Crypto,
  NetworkAccess,
  AbstractFileSystem,
} from "./contracts/ExternalDependencies.js";
export type { DependencyProvider, ResolvedDependency } from "./contracts/DependencyProvider.js";

// Coordinadores
export { UseCaseCoordinator } from "./coordinators/UseCaseCoordinator.js";

// Errores
export {
  HostError,
  createHostError,
  type HostErrorOptions,
  type HostErrorOrigin,
} from "./errors/HostError.js";
export { HostErrorCode } from "./errors/HostErrorCatalog.js";

// Estado
export type {
  HostStatusReport,
  CompositionReport,
  ComponentReportEntry,
  ComponentOutcome,
  ShutdownReportSummary,
} from "./status/HostStatusReport.js";
export type { CleanupFailure } from "./composition/CleanupStack.js";
