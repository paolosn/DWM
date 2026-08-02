import type { BackupManifest } from "./BackupManifest.js";
import type { BackupState } from "./BackupState.js";
import type { BackupProgress } from "./BackupProgress.js";
import type { BackupPolicy } from "./BackupPolicy.js";
import type { BackupIssue } from "./BackupResult.js";

/** Instantánea de solo lectura de un backup registrado, para introspección. */
export interface BackupDescriptor {
  readonly manifest: BackupManifest;
  readonly state: BackupState;
  readonly policy: BackupPolicy;
  readonly progress?: BackupProgress;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
