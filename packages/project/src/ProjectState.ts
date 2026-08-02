export type ProjectState = "created" | "open" | "closed" | "error" | "deleted";

const ALLOWED_TRANSITIONS: Record<ProjectState, readonly ProjectState[]> = {
  created: ["open", "error", "deleted"],
  open: ["closed", "error", "deleted"],
  closed: ["open", "error", "deleted"],
  error: ["open", "closed", "deleted"],
  deleted: [],
};

export function isProjectStateTransitionAllowed(from: ProjectState, to: ProjectState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
