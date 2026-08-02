import type { BackupIssue } from "@dwm/backup";
import type { RestoreState } from "./RestoreState.js";
import type { RestoreProgress } from "./RestoreProgress.js";
import type { RestoreRequest } from "./RestoreRequest.js";

export interface RestoreDescriptor {
  readonly restoreId: string;
  readonly request: RestoreRequest;
  readonly state: RestoreState;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly itemsRestored: number;
  readonly progress?: RestoreProgress;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}
