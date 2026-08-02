export type { BackupState } from "./BackupState.js";
export { isBackupStateTransitionAllowed, isTerminalBackupState } from "./BackupState.js";
export type { BackupType } from "./BackupType.js";
export type { BackupResourceType, BackupResource } from "./BackupResource.js";
export { isSafeRelativePath } from "./BackupResource.js";
export type { BackupTarget } from "./BackupTarget.js";
export type { BackupProvider, BackupProviderMetadata } from "./BackupProvider.js";
export { LocalBackupProvider } from "./LocalBackupProvider.js";
export type {
  BackupSourceResolver,
  ResolvedBackupResource,
  ManagedBackupSourceResolverOptions,
} from "./BackupSourceResolver.js";
export { ManagedBackupSourceResolver } from "./BackupSourceResolver.js";
export type { BackupProgress, BackupProgressPhase } from "./BackupProgress.js";
export { makeBackupProgress } from "./BackupProgress.js";
export type { BackupManifest } from "./BackupManifest.js";
export { BACKUP_FORMAT_VERSION } from "./BackupManifest.js";
export type { BackupRequest } from "./BackupRequest.js";
export type { BackupResult, BackupIssue } from "./BackupResult.js";
export type { BackupPolicy } from "./BackupPolicy.js";
export { defaultBackupPolicy } from "./BackupPolicy.js";
export type { RetentionPolicy } from "./RetentionPolicy.js";
export { validateRetentionPolicy } from "./RetentionPolicy.js";
export type { BackupDescriptor } from "./BackupDescriptor.js";
export {
  BackupValidator,
  type BackupValidationIssue,
  type BackupValidationResult,
} from "./BackupValidator.js";
export {
  IntegrityVerifier,
  computeChecksum,
  type IntegrityStatus,
  type IntegrityResult,
} from "./IntegrityVerifier.js";
export { BackupRegistry, type BackupRecord, type BackupFilter } from "./BackupRegistry.js";
export { BackupStore, type PersistedBackup } from "./BackupStore.js";
export {
  BackupManager,
  type BackupManagerOptions,
  type DeleteBackupOptions,
  type ApplyRetentionOptions,
  type RetentionResult,
} from "./BackupManager.js";

export {
  BackupError,
  createBackupError,
  type BackupErrorOptions,
  type BackupErrorOrigin,
} from "./errors/BackupError.js";
export { BackupErrorCode } from "./errors/BackupErrorCode.js";
