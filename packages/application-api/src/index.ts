// Tipos y constantes base
export {
  ALL_APPLICATION_CAPABILITIES,
  isApplicationCapability,
  APPLICATION_API_VERSION,
  APPLICATION_API_MIN_COMPATIBLE_VERSION,
  isApiVersionCompatible,
  ALL_APPLICATION_OPERATION_STATES,
  APPLICATION_LIMITS,
  type ApplicationCapability,
  type ApplicationErrorCategory,
  type ApplicationOperationState,
} from "./ApplicationTypes.js";

// Contrato de solicitud / respuesta
export type {
  ApplicationRequest,
  ApplicationRequestMetadata,
  ApplicationCallerContext,
  ApplicationConfirmation,
  ApplicationOperationMap,
  KnownOperationName,
  TypedApplicationRequest,
} from "./ApplicationRequest.js";
export {
  makeSuccessResponse,
  makeErrorResponse,
  type ApplicationResponse,
  type ApplicationSuccessResponse,
  type ApplicationErrorResponse,
  type ApplicationResponseMetadata,
} from "./ApplicationResponse.js";

// Errores
export {
  ApplicationError,
  createApplicationError,
  type ApplicationErrorOptions,
  type ApplicationErrorOrigin,
} from "./errors/ApplicationError.js";
export { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";
export { mapErrorToPayload, type ApplicationErrorPayload } from "./ApplicationErrorMapper.js";

// Validación
export { ApplicationValidator } from "./ApplicationValidator.js";

// Permisos y capacidades
export {
  ApplicationPermissions,
  type OperationPermissionDescriptor,
} from "./ApplicationPermissions.js";

// Eventos
export {
  ApplicationEvents,
  ApplicationEventName,
  type ApplicationEventNameValue,
  type ApplicationRequestEventPayload,
  type ApplicationOperationEventPayload,
  type ApplicationPermissionDeniedEventPayload,
} from "./ApplicationEvents.js";

// Operaciones (catálogo + progreso)
export {
  ApplicationOperation,
  isApplicationOperationTransitionAllowed,
  isTerminalApplicationOperationState,
  type ApplicationOperationSnapshot,
} from "./ApplicationOperation.js";
export {
  ApplicationOperationRegistry,
  type ApplicationOperationDefinition,
} from "./ApplicationOperationRegistry.js";

// Contexto, registro de controladores y router
export { ApplicationContext, type ApplicationContextOptions } from "./ApplicationContext.js";
export { ApplicationRegistry, type ApplicationController } from "./ApplicationRegistry.js";
export { ApplicationRouter, type ApplicationRouterOptions } from "./ApplicationRouter.js";

// Fachada principal
export {
  ApplicationAPI,
  type ApplicationAPIOptions,
  type ApplicationVersionInfo,
} from "./ApplicationAPI.js";

// Controladores (útiles para pruebas de integración externas y para
// componer `ApplicationRegistry`s a medida)
export { WorkspaceController } from "./controllers/WorkspaceController.js";
export { ImportController } from "./controllers/ImportController.js";
export { AgentController } from "./controllers/AgentController.js";
export { SkillController } from "./controllers/SkillController.js";
export { RuleController } from "./controllers/RuleController.js";
export { KnowledgeController } from "./controllers/KnowledgeController.js";
export { ClientController } from "./controllers/ClientController.js";
export { ProjectController } from "./controllers/ProjectController.js";
export { EnvironmentController } from "./controllers/EnvironmentController.js";
export { PortablePackageController } from "./controllers/PortablePackageController.js";
export { AICreatorController } from "./controllers/AICreatorController.js";
export { BackupController } from "./controllers/BackupController.js";
export { RestoreController } from "./controllers/RestoreController.js";
export { VerificationController } from "./controllers/VerificationController.js";
export { StatusController } from "./controllers/StatusController.js";
export { ConfigController } from "./controllers/ConfigController.js";
export { ProfileController } from "./controllers/ProfileController.js";
export { PluginController } from "./controllers/PluginController.js";
export { DeliveryController, type DeliveryDTO } from "./controllers/DeliveryController.js";
export { ConnectionsController } from "./controllers/ConnectionsController.js";
export { ProvisioningController } from "./controllers/ProvisioningController.js";
export {
  ContentSyncController,
  type ContentSyncCatalogEntry,
} from "./controllers/ContentSyncController.js";
export { appendClientActivity, listClientActivity, type ActivityEntry } from "./ActivityLog.js";
export { indexProjectDocuments, type ClientDocumentEntry } from "./ClientDocumentIndex.js";

// Adaptador in-process (único adaptador implementado en este módulo)
export { InProcessAdapter, type InProcessCallOptions } from "./adapters/InProcessAdapter.js";
