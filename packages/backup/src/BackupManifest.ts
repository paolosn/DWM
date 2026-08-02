import type { BackupType } from "./BackupType.js";
import type { BackupResource } from "./BackupResource.js";
import type { BackupTarget } from "./BackupTarget.js";

export const BACKUP_FORMAT_VERSION = "1.0.0";

export interface BackupManifest {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly type: BackupType;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly createdBy?: string;
  readonly includedResources: readonly BackupResource[];
  readonly excludedPaths: readonly string[];
  readonly target: BackupTarget;
  readonly providerId: string;
  readonly sizeBytes?: number;
  readonly itemCount?: number;
  readonly checksum?: string;
  readonly baseBackupId?: string;
  readonly changedResourceIds?: readonly string[];
  readonly formatVersion: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
