import type { EventEnvelope } from "../EventEnvelope.js";

/**
 * Middleware ejecutado antes del despacho a los suscriptores. Si un
 * middleware no invoca `next()`, la publicación se cancela: ningún
 * suscriptor recibe el evento. Un middleware puede transformar el envelope
 * devolviendo uno nuevo desde `next()`, o simplemente reenviar el recibido.
 */
export type EventMiddleware = (
  envelope: EventEnvelope,
  next: () => Promise<void>
) => Promise<void> | void;
