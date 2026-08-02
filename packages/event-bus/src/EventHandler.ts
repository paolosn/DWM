import type { EventEnvelope } from "./EventEnvelope.js";
import type { PropagationControl } from "./PropagationControl.js";

export type EventHandler<T = unknown> = (
  envelope: EventEnvelope<T>,
  control: PropagationControl
) => void | Promise<void>;

export interface SubscribeOptions {
  /** Prioridad de despacho entre suscriptores que coincidan con el mismo evento (mayor primero). Por defecto: 0. */
  readonly priority?: number;
  /** Filtro adicional: si devuelve `false`, el suscriptor no recibe el evento. */
  readonly filter?: (envelope: EventEnvelope) => boolean;
}
