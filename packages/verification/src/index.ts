export type { VerificationCategory } from "./VerificationCategory.js";
export {
  ALL_VERIFICATION_CATEGORIES,
  isValidVerificationCategory,
} from "./VerificationCategory.js";
export type { CheckStatus, CheckResult } from "./CheckResult.js";
export type { VerificationState } from "./VerificationState.js";
export {
  isVerificationStateTransitionAllowed,
  isTerminalVerificationState,
} from "./VerificationState.js";
export type { VerificationRequest } from "./VerificationRequest.js";
export type { VerificationResult, VerificationSummary } from "./VerificationResult.js";
export type { VerificationDescriptor } from "./VerificationDescriptor.js";
export {
  VerificationValidator,
  type VerificationValidationIssue,
  type VerificationValidationResult,
} from "./VerificationValidator.js";
export * as VerificationCheckers from "./VerificationCheckers.js";
export {
  VerificationRegistry,
  type VerificationRecord,
  type VerificationFilter,
} from "./VerificationRegistry.js";
export { VerificationStore, type PersistedVerification } from "./VerificationStore.js";
export { VerificationManager, type VerificationManagerOptions } from "./VerificationManager.js";

export {
  VerificationError,
  createVerificationError,
  type VerificationErrorOptions,
  type VerificationErrorOrigin,
} from "./errors/VerificationError.js";
export { VerificationErrorCode } from "./errors/VerificationErrorCode.js";
