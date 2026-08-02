import type { VerificationCategory } from "./VerificationCategory.js";

export type CheckStatus = "pass" | "warning" | "fail";

export interface CheckResult {
  readonly category: VerificationCategory;
  readonly checkId: string;
  readonly status: CheckStatus;
  readonly message: string;
  readonly resourceId?: string;
}
