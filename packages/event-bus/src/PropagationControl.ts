/**
 * Control de propagación entregado a cada suscriptor junto con el
 * `EventEnvelope`. En modo de despacho "sync", invocar `stopPropagation()`
 * impide que los suscriptores restantes (de menor prioridad, o posteriores
 * en orden de registro) reciban el evento. En modo "async" no tiene efecto,
 * porque todos los suscriptores ya han sido invocados de forma concurrente.
 */
export class PropagationControl {
  private stopped = false;

  stopPropagation(): void {
    this.stopped = true;
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}
