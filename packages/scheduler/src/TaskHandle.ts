import type { ScheduledTask } from "./ScheduledTask.js";

/** Asa devuelta por `Scheduler.schedule()`. Permite controlar el ciclo de vida de una tarea. */
export interface TaskHandle {
  readonly id: string;
  /** Instantánea actual de la tarea. */
  snapshot(): ScheduledTask;
  /** Cancela la tarea: no se ejecutará más. Si está en ejecución, se le permite terminar. */
  cancel(): void;
  /** Pausa la tarea: deja de considerarse "debida" hasta `resume()`. */
  pause(): void;
  /** Reanuda una tarea pausada. */
  resume(): void;
  /** Ejecuta la tarea inmediatamente, fuera de su programación habitual, respetando la concurrencia. */
  runNow(): Promise<void>;
}
