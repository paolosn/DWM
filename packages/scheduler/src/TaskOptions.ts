import type { BackoffOptions } from "./backoff.js";
import { SchedulerErrorCode } from "./errors/SchedulerErrorCode.js";
import { createSchedulerError } from "./errors/SchedulerError.js";

export interface RetryOptions {
  /** Número máximo de intentos totales (incluido el primero). Mínimo 1. */
  readonly maxAttempts: number;
  readonly backoff: BackoffOptions;
}

export interface TaskOptions {
  /** Identificador único; se genera automáticamente si se omite. */
  readonly id?: string;
  /** Retardo, en milisegundos, antes de la primera ejecución. Por defecto: 0 (inmediata). */
  readonly delayMs?: number;
  /** Intervalo fijo, en milisegundos, entre ejecuciones sucesivas (programación periódica). */
  readonly intervalMs?: number;
  /** Expresión cron de 5 campos para programación periódica basada en calendario. */
  readonly cronExpression?: string;
  /** Si es `true`, la tarea se ejecuta una única vez aunque declare `intervalMs`/`cronExpression`. */
  readonly once?: boolean;
  /** Prioridad de ejecución dentro de la cola (mayor se ejecuta antes). Por defecto: 0. */
  readonly priority?: number;
  /** Tiempo máximo, en milisegundos, permitido para una ejecución. Sin límite si se omite. */
  readonly timeoutMs?: number;
  readonly retry?: RetryOptions;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function validateTaskOptions(options: TaskOptions): void {
  const problems: string[] = [];
  if (options.delayMs !== undefined && (options.delayMs < 0 || !Number.isFinite(options.delayMs))) {
    problems.push('"delayMs" debe ser un número finito >= 0.');
  }
  if (
    options.intervalMs !== undefined &&
    (options.intervalMs <= 0 || !Number.isFinite(options.intervalMs))
  ) {
    problems.push('"intervalMs" debe ser un número finito > 0.');
  }
  if (options.intervalMs !== undefined && options.cronExpression !== undefined) {
    problems.push('No se puede declarar "intervalMs" y "cronExpression" simultáneamente.');
  }
  if (
    options.timeoutMs !== undefined &&
    (options.timeoutMs <= 0 || !Number.isFinite(options.timeoutMs))
  ) {
    problems.push('"timeoutMs" debe ser un número finito > 0.');
  }
  if (options.retry !== undefined && options.retry.maxAttempts < 1) {
    problems.push('"retry.maxAttempts" debe ser >= 1.');
  }
  if (problems.length > 0) {
    throw createSchedulerError({
      code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS,
      message: `Opciones de tarea inválidas: ${problems.join(" ")}`,
      origin: "task-options",
      recoverable: true,
    });
  }
}
