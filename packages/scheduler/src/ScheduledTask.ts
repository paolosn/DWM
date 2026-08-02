import type { TaskOptions } from "./TaskOptions.js";

export type TaskStatus = "scheduled" | "running" | "paused" | "cancelled" | "completed" | "failed";

/** Instantánea de solo lectura de una tarea programada, para introspección y estadísticas. */
export interface ScheduledTask {
  readonly id: string;
  readonly options: TaskOptions;
  readonly status: TaskStatus;
  readonly nextRunAt: number | null;
  readonly lastRunAt: number | null;
  readonly runCount: number;
  readonly failureCount: number;
  readonly attempt: number;
}
