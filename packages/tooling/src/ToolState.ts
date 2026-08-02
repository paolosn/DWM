export type ToolState = "registered" | "initialized" | "active" | "inactive" | "error" | "removed";

const ALLOWED_TRANSITIONS: Record<ToolState, readonly ToolState[]> = {
  registered: ["initialized", "error", "removed"],
  initialized: ["active", "error", "removed", "registered"],
  active: ["inactive", "error", "removed"],
  inactive: ["active", "error", "removed", "registered"],
  error: ["initialized", "active", "inactive", "removed", "registered"],
  removed: [],
};

export function isToolStateTransitionAllowed(from: ToolState, to: ToolState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
