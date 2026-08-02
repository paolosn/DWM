export type ImportProgressPhase =
  "scanning" | "validating" | "copying" | "verifying" | "rolling_back" | "cancelling";

export interface ImportProgress {
  readonly phase: ImportProgressPhase;
  readonly itemsProcessed: number;
  readonly itemsTotal?: number;
  readonly currentEntry?: string;
  readonly percentage?: number;
  readonly updatedAt: string;
}

export function makeImportProgress(
  phase: ImportProgressPhase,
  itemsProcessed: number,
  options: { itemsTotal?: number; currentEntry?: string } = {}
): ImportProgress {
  const percentage =
    options.itemsTotal && options.itemsTotal > 0
      ? Math.min(100, Math.round((itemsProcessed / options.itemsTotal) * 100))
      : undefined;
  return {
    phase,
    itemsProcessed,
    updatedAt: new Date().toISOString(),
    ...(options.itemsTotal !== undefined ? { itemsTotal: options.itemsTotal } : {}),
    ...(options.currentEntry !== undefined ? { currentEntry: options.currentEntry } : {}),
    ...(percentage !== undefined ? { percentage } : {}),
  };
}
