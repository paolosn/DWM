import type { BackupState } from "./BackupState.js";

export interface BackupIssue {
  readonly code: string;
  readonly message: string;
}

export interface BackupResult {
  readonly backupId: string;
  readonly state: BackupState;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
