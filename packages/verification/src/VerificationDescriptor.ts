import type { VerificationCategory } from "./VerificationCategory.js";
import type { VerificationState } from "./VerificationState.js";
import type { VerificationRequest } from "./VerificationRequest.js";
import type { CheckResult } from "./CheckResult.js";
import type { VerificationSummary } from "./VerificationResult.js";

export interface VerificationDescriptor {
  readonly verificationId: string;
  readonly request: VerificationRequest;
  readonly state: VerificationState;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly categories: readonly VerificationCategory[];
  readonly checks: readonly CheckResult[];
  readonly summary: VerificationSummary;
}
