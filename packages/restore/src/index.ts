export type { RestoreState } from "./RestoreState.js";
export { isRestoreStateTransitionAllowed, isTerminalRestoreState } from "./RestoreState.js";
export type { RestoreProgress, RestoreProgressPhase } from "./RestoreProgress.js";
export { makeRestoreProgress } from "./RestoreProgress.js";
export type { RestoreRequest } from "./RestoreRequest.js";
export type { RestoreResult } from "./RestoreResult.js";
export type { RestoreDescriptor } from "./RestoreDescriptor.js";
export {
  RestoreValidator,
  type RestoreValidationIssue,
  type RestoreValidationResult,
} from "./RestoreValidator.js";
export type {
  RestoreTargetResolver,
  RestoreApplyResult,
  ManagedRestoreTargetResolverOptions,
} from "./RestoreTargetResolver.js";
export { ManagedRestoreTargetResolver } from "./RestoreTargetResolver.js";
export { RestoreRegistry, type RestoreRecord, type RestoreFilter } from "./RestoreRegistry.js";
export { RestoreStore, type PersistedRestore } from "./RestoreStore.js";
export { RestoreManager, type RestoreManagerOptions } from "./RestoreManager.js";

export {
  RestoreError,
  createRestoreError,
  type RestoreErrorOptions,
  type RestoreErrorOrigin,
} from "./errors/RestoreError.js";
export { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
