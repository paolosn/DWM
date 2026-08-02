import type { ImportIssue, ImportRequest } from "./ImportTypes.js";
import type { ImportState } from "./ImportState.js";
import type { ImportProgress } from "./ImportProgress.js";

export interface ImportDescriptor {
  readonly importId: string;
  readonly request: ImportRequest;
  readonly state: ImportState;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly destinationPath?: string;
  readonly filesImported: number;
  readonly directoriesImported: number;
  readonly progress?: ImportProgress;
  readonly warnings: readonly ImportIssue[];
  readonly errors: readonly ImportIssue[];
}
