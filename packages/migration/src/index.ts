export type { MigrationState } from "./MigrationState.js";
export { isMigrationStateTransitionAllowed, isTerminalMigrationState } from "./MigrationState.js";
export type {
  MigrationExportRequest,
  MigrationImportRequest,
  MigrationConflictStrategy,
} from "./MigrationRequest.js";
export type { MigrationResult } from "./MigrationResult.js";
export type { MigrationDescriptor } from "./MigrationDescriptor.js";
export {
  MigrationValidator,
  type MigrationValidationIssue,
  type MigrationValidationResult,
} from "./MigrationValidator.js";
export {
  MigrationConflictDetector,
  type MigrationConflict,
  type MigrationConflictDetectorOptions,
} from "./MigrationConflict.js";
export {
  MigrationRegistry,
  type MigrationRecord,
  type MigrationFilter,
} from "./MigrationRegistry.js";
export { MigrationStore, type PersistedMigration } from "./MigrationStore.js";
export { MigrationManager, type MigrationManagerOptions } from "./MigrationManager.js";

export {
  MigrationError,
  createMigrationError,
  type MigrationErrorOptions,
  type MigrationErrorOrigin,
} from "./errors/MigrationError.js";
export { MigrationErrorCode } from "./errors/MigrationErrorCode.js";
