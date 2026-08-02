import type { ImportIssue, ImportSourceType } from "./ImportTypes.js";
import type { ImportState } from "./ImportState.js";

export interface ImportResult {
  readonly importId: string;
  readonly state: ImportState;
  readonly dryRun: boolean;
  readonly sourceType: ImportSourceType;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly filesImported: number;
  readonly directoriesImported: number;
  readonly warnings: readonly ImportIssue[];
  readonly errors: readonly ImportIssue[];
}
