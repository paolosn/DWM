export type VerificationCategory =
  | "projects"
  | "workspaces"
  | "profiles"
  | "config"
  | "secrets"
  | "plugins"
  | "backups"
  | "restores"
  | "migrations"
  | "dependencies"
  | "consistency"
  | "integrity"
  | "compatibility";

export const ALL_VERIFICATION_CATEGORIES: readonly VerificationCategory[] = [
  "projects",
  "workspaces",
  "profiles",
  "config",
  "secrets",
  "plugins",
  "backups",
  "restores",
  "migrations",
  "dependencies",
  "consistency",
  "integrity",
  "compatibility",
];

export function isValidVerificationCategory(value: unknown): value is VerificationCategory {
  return (
    typeof value === "string" && (ALL_VERIFICATION_CATEGORIES as readonly string[]).includes(value)
  );
}
