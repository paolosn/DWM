export type {
  ImportSourceType,
  ImportEntry,
  ImportScanResult,
  ImportIssue,
  ImportRequest,
} from "./ImportTypes.js";
export { isImportSourceType, isHiddenRelativePath } from "./ImportTypes.js";

export type { ImportState } from "./ImportState.js";
export { isImportStateTransitionAllowed, isTerminalImportState } from "./ImportState.js";

export type { ImportProgress, ImportProgressPhase } from "./ImportProgress.js";
export { makeImportProgress } from "./ImportProgress.js";

export type { ImportResult } from "./ImportResult.js";
export type { ImportDescriptor } from "./ImportDescriptor.js";

export { ImportScanner } from "./ImportScanner.js";
export {
  ImportValidator,
  type ImportValidationIssue,
  type ImportValidationResult,
} from "./ImportValidator.js";
export {
  ImportService,
  type CopyProgressUpdate,
  type CopyToStagingOptions,
  type CopyToStagingResult,
} from "./ImportService.js";
export { ImportRegistry, type ImportRecord, type ImportFilter } from "./ImportRegistry.js";
export { ImportStore, type PersistedImport } from "./ImportStore.js";
export { ImportManager, type ImportManagerOptions } from "./ImportManager.js";

export {
  ImportError,
  createImportError,
  type ImportErrorOptions,
  type ImportErrorOrigin,
} from "./errors/ImportError.js";
export { ImportErrorCode } from "./errors/ImportErrorCode.js";
