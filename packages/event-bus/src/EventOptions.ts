import type { EventPriority } from "./EventPriority.js";

/** Modo de entrega a los suscriptores. */
export type EventDispatchMode = "sync" | "async";

export interface EventOptions {
  readonly priority?: EventPriority;
  readonly correlationId?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * "sync" (por defecto): los suscriptores se invocan secuencialmente, cada
   * uno esperado antes del siguiente; la propagación puede detenerse entre
   * suscriptores (`control.stopPropagation()`).
   * "async": todos los suscriptores coincidentes se invocan de forma
   * concurrente; `publish()` espera a que todos concluyan, pero detener la
   * propagación entre suscriptores no tiene efecto (ya se lanzaron todos).
   */
  readonly mode?: EventDispatchMode;
}
