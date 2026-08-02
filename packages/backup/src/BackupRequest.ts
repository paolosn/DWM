import type { BackupType } from "./BackupType.js";
import type { BackupResource } from "./BackupResource.js";
import type { BackupTarget } from "./BackupTarget.js";

export interface BackupRequest {
  readonly name?: string;
  readonly description?: string;
  readonly type: BackupType;
  readonly resources: readonly BackupResource[];
  readonly excludedPaths?: readonly string[];
  readonly target: BackupTarget;
  readonly createdBy?: string;
  /** Obligatorio si `type === "incremental"`. */
  readonly baseBackupId?: string;
  readonly retentionPolicyId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
