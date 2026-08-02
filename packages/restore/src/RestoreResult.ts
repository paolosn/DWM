import type { BackupIssue } from "@dwm/backup";
import type { RestoreState } from "./RestoreState.js";

export interface RestoreResult {
  readonly restoreId: string;
  readonly backupId: string;
  readonly state: RestoreState;
  readonly dryRun: boolean;
  readonly itemsRestored: number;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
