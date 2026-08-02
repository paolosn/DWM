export type BackupProgressPhase =
  "preparing" | "copying" | "verifying" | "finalizing" | "cancelling";

export interface BackupProgress {
  readonly phase: BackupProgressPhase;
  readonly itemsProcessed: number;
  readonly itemsTotal?: number;
  readonly bytesProcessed: number;
  readonly bytesTotal?: number;
  readonly currentResource?: string;
  readonly percentage?: number;
  readonly updatedAt: string;
}

export function makeBackupProgress(
  phase: BackupProgressPhase,
  itemsProcessed: number,
  bytesProcessed: number,
  options: { itemsTotal?: number; bytesTotal?: number; currentResource?: string } = {}
): BackupProgress {
  const percentage =
    options.itemsTotal && options.itemsTotal > 0
      ? Math.min(100, Math.round((itemsProcessed / options.itemsTotal) * 100))
      : undefined;
  return {
    phase,
    itemsProcessed,
    bytesProcessed,
    updatedAt: new Date().toISOString(),
    ...(options.itemsTotal !== undefined ? { itemsTotal: options.itemsTotal } : {}),
    ...(options.bytesTotal !== undefined ? { bytesTotal: options.bytesTotal } : {}),
    ...(options.currentResource !== undefined ? { currentResource: options.currentResource } : {}),
    ...(percentage !== undefined ? { percentage } : {}),
  };
}
