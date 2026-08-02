export {
  REQUIRED_DIRECTORIES,
  WORKSPACE_METADATA_RELATIVE_PATH,
  type WorkspaceValidationIssue,
  type WorkspaceValidationResult,
  type PermissionCheckResult,
  type SpaceCheckResult,
} from "./WorkspaceTypes.js";
export { WorkspacePaths } from "./WorkspacePaths.js";
export {
  WORKSPACE_METADATA_FORMAT_VERSION,
  type WorkspaceMetadata,
  createInitialWorkspaceMetadata,
  touchWorkspaceMetadata,
  validateWorkspaceMetadataShape,
  readWorkspaceMetadata,
  writeWorkspaceMetadata,
} from "./WorkspaceMetadata.js";
export { WorkspaceLocator, type MoveDetectionResult } from "./WorkspaceLocator.js";
export { WorkspaceInitializer, type InitializeResult } from "./WorkspaceInitializer.js";
export { WorkspaceValidator } from "./WorkspaceValidator.js";
export { WorkspaceRegistry, type WorkspaceRegistryEntry } from "./WorkspaceRegistry.js";
export {
  PortableWorkspaceManager,
  type PortableWorkspaceManagerOptions,
  type SuggestedPaths,
} from "./PortableWorkspaceManager.js";

export {
  WorkspaceError,
  createWorkspaceError,
  type WorkspaceErrorOptions,
  type WorkspaceErrorOrigin,
} from "./errors/WorkspaceError.js";
export { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
