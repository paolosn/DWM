export type MigrationState =
  | "pending"
  | "preparing"
  | "running"
  | "verifying"
  | "completed"
  | "completed_with_warnings"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "rolled_back";

const ALLOWED_TRANSITIONS: Record<MigrationState, readonly MigrationState[]> = {
  pending: ["preparing", "cancelling", "failed"],
  preparing: ["running", "cancelling", "failed"],
  running: [
    "verifying",
    "completed",
    "completed_with_warnings",
    "cancelling",
    "cancelled",
    "failed",
    "rolled_back",
  ],
  verifying: ["completed", "completed_with_warnings", "failed"],
  completed: [],
  completed_with_warnings: [],
  cancelling: ["cancelled", "failed"],
  cancelled: ["rolled_back"],
  failed: ["rolled_back"],
  rolled_back: [],
};

export function isMigrationStateTransitionAllowed(
  from: MigrationState,
  to: MigrationState
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalMigrationState(state: MigrationState): boolean {
  return (
    state === "completed" ||
    state === "completed_with_warnings" ||
    state === "cancelled" ||
    state === "failed" ||
    state === "rolled_back"
  );
}
