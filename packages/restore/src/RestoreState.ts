export type RestoreState =
  | "pending"
  | "preparing"
  | "restoring"
  | "verifying"
  | "completed"
  | "completed_with_warnings"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "rolled_back";

const ALLOWED_TRANSITIONS: Record<RestoreState, readonly RestoreState[]> = {
  pending: ["preparing", "cancelling", "failed"],
  preparing: ["restoring", "cancelling", "failed"],
  restoring: ["verifying", "cancelling", "failed"],
  verifying: ["completed", "completed_with_warnings", "failed"],
  completed: [],
  completed_with_warnings: [],
  cancelling: ["cancelled", "failed"],
  cancelled: ["rolled_back"],
  failed: ["rolled_back"],
  rolled_back: [],
};

export function isRestoreStateTransitionAllowed(from: RestoreState, to: RestoreState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalRestoreState(state: RestoreState): boolean {
  return (
    state === "completed" ||
    state === "completed_with_warnings" ||
    state === "cancelled" ||
    state === "failed" ||
    state === "rolled_back"
  );
}
