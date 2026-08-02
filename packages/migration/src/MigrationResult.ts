import type { BackupIssue } from "@dwm/backup";
import type { MigrationState } from "./MigrationState.js";

export interface MigrationResult {
  readonly migrationId: string;
  readonly direction: "export" | "import";
  readonly state: MigrationState;
  readonly backupId?: string;
  readonly restoreId?: string;
  readonly dryRun: boolean;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
