import { randomUUID } from "node:crypto";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { TaskOptions } from "./TaskOptions.js";
import { validateTaskOptions } from "./TaskOptions.js";
import type { ScheduledTask, TaskStatus } from "./ScheduledTask.js";
import type { TaskHandle } from "./TaskHandle.js";
import type { SchedulerConfiguration } from "./SchedulerConfiguration.js";
import { resolveSchedulerConfiguration } from "./SchedulerConfiguration.js";
import type { SchedulerStatistics } from "./SchedulerStatistics.js";
import { emptySchedulerStatistics } from "./SchedulerStatistics.js";
import { getNextCronOccurrence } from "./cron.js";
import { computeBackoffDelay } from "./backoff.js";
import { SchedulerErrorCode } from "./errors/SchedulerErrorCode.js";
import { createSchedulerError } from "./errors/SchedulerError.js";

export type TaskExecutor = () => void | Promise<void>;

/**
 * Lee `record.status` a través de una función para evitar que TypeScript
 * estreche su tipo literal (p. ej. a `"running"`) entre puntos `await`: el
 * estado puede mutar de forma asíncrona (p. ej. `TaskHandle.cancel()`)
 * mientras una ejecución está en curso.
 */
function statusOf(record: TaskRecord): TaskStatus {
  return record.status;
}

interface TaskRecord {
  readonly id: string;
  readonly options: TaskOptions;
  readonly handler: TaskExecutor;
  readonly periodic: boolean;
  status: TaskStatus;
  nextRunAt: number | null;
  lastRunAt: number | null;
  runCount: number;
  failureCount: number;
  attempt: number;
  queued: boolean;
}

export interface SchedulerOptions {
  readonly configuration?: SchedulerConfiguration;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
}

/**
 * Motor de programación de tareas. Mantiene un único temporizador interno
 * que siempre apunta a la próxima tarea debida; al vencer, encola las
 * tareas debidas (ordenadas por prioridad) y las despacha respetando la
 * concurrencia máxima configurada.
 */
export class Scheduler {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly config: Required<SchedulerConfiguration>;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly readyQueue: TaskRecord[] = [];
  private runningCount = 0;
  private shuttingDown = false;
  private idleWaiters: Array<() => void> = [];

  private stats = emptySchedulerStatistics();

  constructor(options: SchedulerOptions = {}) {
    this.config = resolveSchedulerConfiguration(options.configuration ?? {});
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
  }

  schedule(handler: TaskExecutor, options: TaskOptions = {}): TaskHandle {
    if (this.shuttingDown) {
      throw createSchedulerError({
        code: SchedulerErrorCode.SCHEDULER_SHUTTING_DOWN,
        message: "No se pueden programar nuevas tareas: el planificador se está apagando.",
        origin: "lifecycle",
        recoverable: true,
      });
    }
    validateTaskOptions(options);

    const id = options.id ?? randomUUID();
    if (this.tasks.has(id)) {
      throw createSchedulerError({
        code: SchedulerErrorCode.SCHEDULER_DUPLICATE_TASK_ID,
        message: `Ya existe una tarea programada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }

    const periodic =
      !options.once && (options.intervalMs !== undefined || options.cronExpression !== undefined);
    const record: TaskRecord = {
      id,
      options,
      handler,
      periodic,
      status: "scheduled",
      nextRunAt: this.computeInitialRunAt(options),
      lastRunAt: null,
      runCount: 0,
      failureCount: 0,
      attempt: 0,
      queued: false,
    };
    this.tasks.set(id, record);
    this.rescheduleTimer();
    return this.toHandle(record);
  }

  statistics(): SchedulerStatistics {
    let scheduledCount = 0;
    for (const record of this.tasks.values()) {
      if (record.status === "scheduled" || record.status === "paused") scheduledCount += 1;
    }
    return {
      ...this.stats,
      scheduledCount,
      runningCount: this.runningCount,
      queuedCount: this.readyQueue.length,
    };
  }

  getTask(id: string): ScheduledTask | undefined {
    const record = this.tasks.get(id);
    return record ? this.snapshotOf(record) : undefined;
  }

  /**
   * Apagado limpio: deja de aceptar nuevas tareas y de disparar nuevas
   * ejecuciones, y espera (hasta `shutdownGraceMs`) a que las ejecuciones en
   * curso terminen.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.runningCount === 0) return;

    await new Promise<void>((resolve) => {
      const timeoutHandle = setTimeout(resolve, this.config.shutdownGraceMs);
      this.idleWaiters.push(() => {
        clearTimeout(timeoutHandle);
        resolve();
      });
    });
  }

  // ---------------------------------------------------------------------
  // Cálculo de próximas ejecuciones
  // ---------------------------------------------------------------------

  private computeInitialRunAt(options: TaskOptions): number {
    const now = Date.now();
    if (options.cronExpression) {
      return getNextCronOccurrence(options.cronExpression, new Date(now)).getTime();
    }
    if (options.delayMs !== undefined) return now + options.delayMs;
    if (options.intervalMs !== undefined) return now + options.intervalMs;
    return now;
  }

  private computeNextRunAt(record: TaskRecord): number | null {
    if (!record.periodic) return null;
    const now = Date.now();
    if (record.options.cronExpression) {
      return getNextCronOccurrence(record.options.cronExpression, new Date(now)).getTime();
    }
    if (record.options.intervalMs !== undefined) return now + record.options.intervalMs;
    return null;
  }

  // ---------------------------------------------------------------------
  // Temporizador y despacho
  // ---------------------------------------------------------------------

  private rescheduleTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.shuttingDown) return;

    let earliest: number | null = null;
    for (const record of this.tasks.values()) {
      if (record.status !== "scheduled" || record.nextRunAt === null) continue;
      if (earliest === null || record.nextRunAt < earliest) earliest = record.nextRunAt;
    }
    if (earliest === null) return;

    const delay = Math.max(0, earliest - Date.now());
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private tick(): void {
    this.timer = null;
    const now = Date.now();
    for (const record of this.tasks.values()) {
      if (
        record.status === "scheduled" &&
        record.nextRunAt !== null &&
        record.nextRunAt <= now &&
        !record.queued
      ) {
        record.queued = true;
        this.readyQueue.push(record);
      }
    }
    this.pump();
    this.rescheduleTimer();
  }

  private pump(): void {
    this.readyQueue.sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));
    while (this.runningCount < this.config.maxConcurrency && this.readyQueue.length > 0) {
      const record = this.readyQueue.shift()!;
      record.queued = false;
      this.runningCount += 1;
      void this.executeRecord(record).finally(() => {
        this.runningCount -= 1;
        this.pump();
        this.rescheduleTimer();
        this.notifyIfIdle();
      });
    }
  }

  private notifyIfIdle(): void {
    if (this.runningCount === 0 && this.idleWaiters.length > 0) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  // ---------------------------------------------------------------------
  // Ejecución
  // ---------------------------------------------------------------------

  private async executeRecord(record: TaskRecord): Promise<void> {
    record.status = "running";
    record.attempt += 1;
    const startedAt = Date.now();
    this.stats = { ...this.stats, totalStarted: this.stats.totalStarted + 1 };
    await this.notify("start", record);

    try {
      await this.runWithTimeout(record);
      record.lastRunAt = startedAt;

      if (statusOf(record) === "cancelled") return;

      record.runCount += 1;
      record.attempt = 0;
      this.stats = { ...this.stats, totalCompleted: this.stats.totalCompleted + 1 };
      await this.notify("complete", record);
      this.afterExecution(record);
    } catch (err) {
      record.lastRunAt = startedAt;
      record.failureCount += 1;

      if (statusOf(record) === "cancelled") return;

      const maxAttempts = record.options.retry?.maxAttempts ?? 1;
      if (record.attempt < maxAttempts) {
        this.stats = { ...this.stats, totalRetries: this.stats.totalRetries + 1 };
        const delay = computeBackoffDelay(record.options.retry!.backoff, record.attempt);
        record.nextRunAt = Date.now() + delay;
        record.status = "scheduled";
        await this.notify("error", record, err);
      } else {
        record.status = "failed";
        record.nextRunAt = null;
        this.stats = { ...this.stats, totalFailed: this.stats.totalFailed + 1 };
        await this.notify("error", record, err);
        this.afterExecution(record);
      }
    }
  }

  private afterExecution(record: TaskRecord): void {
    if (record.status === "cancelled" || record.status === "scheduled") return;
    if (record.periodic) {
      record.nextRunAt = this.computeNextRunAt(record);
      record.status = "scheduled";
    } else {
      record.nextRunAt = null;
      if (record.status !== "failed") record.status = "completed";
    }
  }

  private async runWithTimeout(record: TaskRecord): Promise<void> {
    const timeoutMs = record.options.timeoutMs;
    if (!timeoutMs) {
      await record.handler();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => record.handler()),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(
              createSchedulerError({
                code: SchedulerErrorCode.SCHEDULER_TASK_TIMEOUT,
                message: `La tarea "${record.id}" superó el tiempo máximo de ${timeoutMs}ms.`,
                origin: "execution",
                recoverable: true,
              })
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------
  // Notificaciones (Logger / EventBus)
  // ---------------------------------------------------------------------

  private async notify(
    phase: "start" | "complete" | "error" | "cancel",
    record: TaskRecord,
    error?: unknown
  ): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `scheduler.task.${phase}`,
        {
          taskId: record.id,
          attempt: record.attempt,
          error: error instanceof Error ? error.message : error,
        },
        { correlationId: record.id }
      );
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(record.id);
      if (phase === "error") {
        await logger.error(`scheduler:task-error ${record.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      } else if (phase === "cancel") {
        await logger.debug(`scheduler:task-cancel ${record.id}`);
      } else {
        await logger.info(`scheduler:task-${phase} ${record.id}`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // Asa pública (TaskHandle)
  // ---------------------------------------------------------------------

  private snapshotOf(record: TaskRecord): ScheduledTask {
    return {
      id: record.id,
      options: record.options,
      status: record.status,
      nextRunAt: record.nextRunAt,
      lastRunAt: record.lastRunAt,
      runCount: record.runCount,
      failureCount: record.failureCount,
      attempt: record.attempt,
    };
  }

  private toHandle(record: TaskRecord): TaskHandle {
    return {
      id: record.id,
      snapshot: () => this.snapshotOf(record),
      cancel: () => {
        if (record.status === "cancelled" || record.status === "completed") return;
        record.status = "cancelled";
        record.nextRunAt = null;
        const index = this.readyQueue.indexOf(record);
        if (index !== -1) this.readyQueue.splice(index, 1);
        void this.notify("cancel", record);
        this.rescheduleTimer();
      },
      pause: () => {
        if (record.status !== "scheduled") return;
        record.status = "paused";
        record.nextRunAt = null;
        this.rescheduleTimer();
      },
      resume: () => {
        if (record.status !== "paused") return;
        record.status = "scheduled";
        record.nextRunAt = this.computeInitialRunAt(record.options);
        this.rescheduleTimer();
      },
      runNow: async () => {
        if (record.status === "cancelled") {
          throw createSchedulerError({
            code: SchedulerErrorCode.SCHEDULER_TASK_NOT_FOUND,
            message: `La tarea "${record.id}" está cancelada y no puede ejecutarse.`,
            origin: "registry",
            recoverable: true,
          });
        }
        await this.acquireSlotAndRun(record);
      },
    };
  }

  private async acquireSlotAndRun(record: TaskRecord): Promise<void> {
    while (this.runningCount >= this.config.maxConcurrency) {
      await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    }
    this.runningCount += 1;
    try {
      await this.executeRecord(record);
    } finally {
      this.runningCount -= 1;
      this.pump();
      this.rescheduleTimer();
      this.notifyIfIdle();
    }
  }
}
