export type ImportState =
  | "pending"
  | "scanning"
  | "validating"
  | "copying"
  | "verifying"
  | "completed"
  | "completed_with_warnings"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "rolled_back";

const ALLOWED_TRANSITIONS: Record<ImportState, readonly ImportState[]> = {
  pending: ["scanning", "cancelling", "failed"],
  scanning: ["validating", "cancelling", "failed"],
  validating: ["copying", "cancelling", "failed"],
  copying: ["verifying", "cancelling", "failed"],
  verifying: ["completed", "completed_with_warnings", "failed"],
  completed: [],
  completed_with_warnings: [],
  cancelling: ["cancelled", "failed"],
  cancelled: ["rolled_back"],
  failed: ["rolled_back"],
  rolled_back: [],
};

export function isImportStateTransitionAllowed(from: ImportState, to: ImportState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalImportState(state: ImportState): boolean {
  return (
    state === "completed" ||
    state === "completed_with_warnings" ||
    state === "cancelled" ||
    state === "failed" ||
    state === "rolled_back"
  );
}
