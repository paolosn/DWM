import type { EventPriority } from "./EventPriority.js";

/**
 * Evento inmutable entregado a cada suscriptor y middleware. `timestamp`
 * siempre está en UTC (ISO-8601, sufijo "Z"). `id` es único por publicación.
 */
export interface EventEnvelope<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: T;
  readonly priority: EventPriority;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
