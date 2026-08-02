/**
 * Estados del ciclo de vida del Core (README §4).
 * Secuencia de arranque estrictamente ordenada; la única transición de
 * retroceso válida es hacia ERROR.
 */
export enum LifecycleState {
  UNINITIALIZED = "UNINITIALIZED",
  BOOTSTRAPPING = "BOOTSTRAPPING",
  LOADING_CONFIG = "LOADING_CONFIG",
  LOADING_PROFILE = "LOADING_PROFILE",
  LOADING_REGISTRIES = "LOADING_REGISTRIES",
  READY = "READY",
  RUNNING = "RUNNING",
  SHUTTING_DOWN = "SHUTTING_DOWN",
  STOPPED = "STOPPED",
  ERROR = "ERROR",
}

/**
 * Tabla de transiciones permitidas. Cualquier transición no presente aquí se
 * considera un error de programación del propio Core (no del usuario ni de un
 * módulo externo) y debe lanzar en tiempo de desarrollo.
 */
const ALLOWED_TRANSITIONS: Record<LifecycleState, ReadonlySet<LifecycleState>> = {
  [LifecycleState.UNINITIALIZED]: new Set([LifecycleState.BOOTSTRAPPING]),
  [LifecycleState.BOOTSTRAPPING]: new Set([LifecycleState.LOADING_CONFIG, LifecycleState.ERROR]),
  [LifecycleState.LOADING_CONFIG]: new Set([LifecycleState.LOADING_PROFILE, LifecycleState.ERROR]),
  [LifecycleState.LOADING_PROFILE]: new Set([
    LifecycleState.LOADING_REGISTRIES,
    LifecycleState.ERROR,
  ]),
  [LifecycleState.LOADING_REGISTRIES]: new Set([LifecycleState.READY, LifecycleState.ERROR]),
  [LifecycleState.READY]: new Set([
    LifecycleState.RUNNING,
    LifecycleState.SHUTTING_DOWN,
    LifecycleState.ERROR,
  ]),
  [LifecycleState.RUNNING]: new Set([LifecycleState.SHUTTING_DOWN, LifecycleState.ERROR]),
  [LifecycleState.SHUTTING_DOWN]: new Set([LifecycleState.STOPPED, LifecycleState.ERROR]),
  // STOPPED admite una reinicialización explícita (README §12, regla H):
  // initialize() puede volver a ejecutarse tras un apagado ordenado.
  [LifecycleState.STOPPED]: new Set([LifecycleState.BOOTSTRAPPING]),
  // ERROR admite reintentar la inicialización desde cero.
  [LifecycleState.ERROR]: new Set([LifecycleState.BOOTSTRAPPING]),
};

export function isTransitionAllowed(from: LifecycleState, to: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}
