export type VerificationState =
  "pending" | "running" | "completed" | "completed_with_warnings" | "failed";

const ALLOWED_TRANSITIONS: Record<VerificationState, readonly VerificationState[]> = {
  pending: ["running", "failed"],
  running: ["completed", "completed_with_warnings", "failed"],
  completed: [],
  completed_with_warnings: [],
  failed: [],
};

export function isVerificationStateTransitionAllowed(
  from: VerificationState,
  to: VerificationState
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalVerificationState(state: VerificationState): boolean {
  return state === "completed" || state === "completed_with_warnings" || state === "failed";
}
