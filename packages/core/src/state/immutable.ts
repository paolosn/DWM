/**
 * Devuelve una copia profunda e inmutable (congelada recursivamente) de
 * `value`. Se usa en toda la API pública que expone estructuras internas del
 * Core (getConfig, getActiveProfile, getSnapshot, listModules, listAdapters)
 * para garantizar que el código externo no pueda mutar accidentalmente el
 * estado interno del Core (README §12, regla L).
 *
 * Solo se admite contenido serializable (objetos planos, arrays, valores
 * primitivos), que es exactamente lo que exponen estas estructuras.
 */
export function deepFreezeClone<T>(value: T): T {
  const clone = structuredClone(value);
  return deepFreeze(clone);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  for (const key of Object.keys(value as object)) {
    const child = (value as Record<string, unknown>)[key];
    deepFreeze(child);
  }
  return Object.freeze(value);
}
