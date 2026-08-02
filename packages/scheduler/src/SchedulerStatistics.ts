/** Estadísticas agregadas del planificador, de solo lectura. */
export interface SchedulerStatistics {
  readonly scheduledCount: number;
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly totalStarted: number;
  readonly totalCompleted: number;
  readonly totalFailed: number;
  readonly totalCancelled: number;
  readonly totalRetries: number;
}

export function emptySchedulerStatistics(): SchedulerStatistics {
  return {
    scheduledCount: 0,
    runningCount: 0,
    queuedCount: 0,
    totalStarted: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalCancelled: 0,
    totalRetries: 0,
  };
}
