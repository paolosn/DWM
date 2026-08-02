export type RestoreProgressPhase =
  "preparing" | "restoring" | "verifying" | "rolling_back" | "cancelling";

export interface RestoreProgress {
  readonly phase: RestoreProgressPhase;
  readonly itemsProcessed: number;
  readonly itemsTotal?: number;
  readonly currentResource?: string;
  readonly percentage?: number;
  readonly updatedAt: string;
}

export function makeRestoreProgress(
  phase: RestoreProgressPhase,
  itemsProcessed: number,
  options: { itemsTotal?: number; currentResource?: string } = {}
): RestoreProgress {
  const percentage =
    options.itemsTotal && options.itemsTotal > 0
      ? Math.min(100, Math.round((itemsProcessed / options.itemsTotal) * 100))
      : undefined;
  return {
    phase,
    itemsProcessed,
    updatedAt: new Date().toISOString(),
    ...(options.itemsTotal !== undefined ? { itemsTotal: options.itemsTotal } : {}),
    ...(options.currentResource !== undefined ? { currentResource: options.currentResource } : {}),
    ...(percentage !== undefined ? { percentage } : {}),
  };
}
