export type {
  Client,
  ClientSummary,
  ClientDwmMetadata,
  ClientReferences,
  ClientCreateRequest,
  ClientUpdateRequest,
  ClientFilter,
  ClientListOptions,
  ClientDeleteOptions,
  ClientReferenceCheck,
  ClientReferenceKind,
  ClientStatus,
} from "./ClientTypes.js";
export {
  CLIENT_DWM_KEY,
  CLIENT_FILE_EXTENSION,
  CLIENT_STATUSES,
  CLIENT_REFERENCE_KINDS,
  isClientStatus,
  isClientReferenceKind,
  isSafeClientId,
  isSafeClientSlug,
  isSafeClientName,
  isSafeClientDescription,
  isSafeClientTag,
  normalizeTags,
  emptyClientReferences,
  withReferenceAdded,
  withReferenceRemoved,
} from "./ClientTypes.js";

export { ClientMetadataService } from "./ClientMetadata.js";
export {
  ClientValidator,
  type ClientValidationIssue,
  type ClientValidationResult,
} from "./ClientValidator.js";
export { ClientRelations, type ClientReferenceManagers } from "./ClientRelations.js";
export { ClientRepository } from "./ClientRepository.js";
export { ClientRegistry } from "./ClientRegistry.js";
export { ClientManager, type ClientManagerOptions } from "./ClientManager.js";

export {
  ClientError,
  createClientError,
  type ClientErrorOptions,
  type ClientErrorOrigin,
} from "./errors/ClientError.js";
export { ClientErrorCode } from "./errors/ClientErrorCode.js";
