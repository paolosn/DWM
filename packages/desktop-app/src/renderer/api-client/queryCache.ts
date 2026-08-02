/**
 * Módulo 33A — API Client. Caché en memoria mínima con invalidación por
 * predicado y suscripción por clave. Documento §16: "no introducir un
 * sistema de estado global pesado sin necesidad" — esto es
 * deliberadamente pequeño (un Map + un pub/sub), no una librería de
 * gestión de estado.
 */

type Listener = () => void;

const store = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

export function makeQueryKey(operation: string, payload: unknown): string {
  return `${operation}::${JSON.stringify(payload ?? null)}`;
}

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/**
 * Guarda el resultado de una consulta exitosa. Deliberadamente NO notifica
 * a los suscriptores de esa clave: `subscribe()` existe para que una
 * invalidación EXTERNA dispare un refetch, no para que una consulta se
 * re-dispare a sí misma cada vez que su propio fetch tiene éxito (eso
 * produce un bucle infinito).
 */
export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}

export function subscribe(key: string, listener: Listener): () => void {
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
  };
}

/** Invalida (borra) toda entrada cuya clave cumpla el predicado, y notifica a sus suscriptores. */
export function invalidateQueries(predicate: (key: string) => boolean): void {
  for (const key of Array.from(store.keys())) {
    if (predicate(key)) {
      store.delete(key);
      notify(key);
    }
  }
}

/** Invalida todas las claves de una operación concreta, sin importar el payload. */
export function invalidateOperation(operation: string): void {
  invalidateQueries((key) => key.startsWith(`${operation}::`));
}

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

/** Solo para pruebas: vacía la caché entre tests. */
export function __resetQueryCacheForTests(): void {
  store.clear();
  listeners.clear();
}
