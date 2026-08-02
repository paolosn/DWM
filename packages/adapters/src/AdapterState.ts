export type AdapterState =
  "registered" | "initialized" | "active" | "inactive" | "error" | "disposed";

const ALLOWED_TRANSITIONS: Record<AdapterState, readonly AdapterState[]> = {
  registered: ["initialized", "error", "disposed"],
  initialized: ["active", "error", "disposed", "registered"],
  active: ["inactive", "error", "disposed"],
  inactive: ["active", "error", "disposed", "registered"],
  error: ["initialized", "active", "inactive", "disposed", "registered"],
  disposed: [],
};

export function isStateTransitionAllowed(from: AdapterState, to: AdapterState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
