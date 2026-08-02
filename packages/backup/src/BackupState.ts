export type BackupState =
  | "pending"
  | "preparing"
  | "running"
  | "verifying"
  | "completed"
  | "completed_with_warnings"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "deleting"
  | "deleted";

const ALLOWED_TRANSITIONS: Record<BackupState, readonly BackupState[]> = {
  pending: ["preparing", "cancelling", "failed"],
  preparing: ["running", "cancelling", "failed"],
  running: ["verifying", "cancelling", "failed"],
  verifying: ["completed", "completed_with_warnings", "cancelling", "failed"],
  completed: ["deleting"],
  completed_with_warnings: ["deleting"],
  cancelling: ["cancelled", "failed"],
  cancelled: ["deleting"],
  failed: ["deleting"],
  deleting: ["deleted", "failed"],
  deleted: [],
};

export function isBackupStateTransitionAllowed(from: BackupState, to: BackupState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalBackupState(state: BackupState): boolean {
  return (
    state === "completed" ||
    state === "completed_with_warnings" ||
    state === "cancelled" ||
    state === "failed"
  );
}
