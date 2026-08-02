export type { WorkspaceState } from "./WorkspaceState.js";
export type { WorkspaceMetadata } from "./WorkspaceMetadata.js";
export { createInitialMetadata, touchMetadata } from "./WorkspaceMetadata.js";
export type { WorkspaceConfiguration } from "./WorkspaceConfiguration.js";
export {
  DEFAULT_EXCLUDE_PATTERNS,
  defaultWorkspaceConfiguration,
  validateWorkspaceConfiguration,
} from "./WorkspaceConfiguration.js";
export { Workspace } from "./Workspace.js";
export { WorkspaceRegistry } from "./WorkspaceRegistry.js";
export { WorkspaceLoader } from "./WorkspaceLoader.js";
export {
  WorkspaceScanner,
  type ScannedFileEntry,
  type WorkspaceIndex,
} from "./WorkspaceScanner.js";
export { WorkspaceManager, type WorkspaceManagerOptions } from "./WorkspaceManager.js";
export { matchesGlob, isExcluded } from "./glob.js";

export {
  WorkspaceError,
  createWorkspaceError,
  type WorkspaceErrorOptions,
  type WorkspaceErrorOrigin,
} from "./errors/WorkspaceError.js";
export { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
