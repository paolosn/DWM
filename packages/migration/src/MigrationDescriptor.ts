import type { BackupIssue } from "@dwm/backup";
import type { MigrationState } from "./MigrationState.js";
import type { MigrationExportRequest, MigrationImportRequest } from "./MigrationRequest.js";

export interface MigrationDescriptor {
  readonly migrationId: string;
  readonly direction: "export" | "import";
  readonly request: MigrationExportRequest | MigrationImportRequest;
  readonly state: MigrationState;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly backupId?: string;
  readonly restoreId?: string;
  readonly sourceDwmVersion?: string;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
