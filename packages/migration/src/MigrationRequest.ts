import type { BackupResource, BackupResourceType, BackupTarget, BackupType } from "@dwm/backup";

export interface MigrationExportRequest {
  readonly type: BackupType;
  readonly resources: readonly BackupResource[];
  readonly excludedPaths?: readonly string[];
  readonly target: BackupTarget;
  /** Solo para migraciones incrementales. */
  readonly baseBackupId?: string;
}

export type MigrationConflictStrategy = "fail" | "skip" | "overwrite";

export interface MigrationImportRequest {
  readonly backupId: string;
  readonly resourceTypes?: readonly BackupResourceType[];
  readonly conflictStrategy?: MigrationConflictStrategy;
  readonly dryRun?: boolean;
  readonly allowOverwriteProtected?: boolean;
}
