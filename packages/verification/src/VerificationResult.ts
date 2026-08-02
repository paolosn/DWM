import type { VerificationCategory } from "./VerificationCategory.js";
import type { VerificationState } from "./VerificationState.js";
import type { CheckResult } from "./CheckResult.js";

export interface VerificationSummary {
  readonly pass: number;
  readonly warning: number;
  readonly fail: number;
}

export interface VerificationResult {
  readonly verificationId: string;
  readonly state: VerificationState;
  readonly dryRun: boolean;
  readonly categories: readonly VerificationCategory[];
  readonly checks: readonly CheckResult[];
  readonly summary: VerificationSummary;
}
