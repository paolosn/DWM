export type ProfileState = "created" | "active" | "inactive" | "error" | "deleted";

const ALLOWED_TRANSITIONS: Record<ProfileState, readonly ProfileState[]> = {
  created: ["active", "inactive", "error", "deleted"],
  active: ["inactive", "error", "deleted"],
  inactive: ["active", "error", "deleted"],
  error: ["active", "inactive", "deleted"],
  deleted: [],
};

export function isProfileStateTransitionAllowed(from: ProfileState, to: ProfileState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
