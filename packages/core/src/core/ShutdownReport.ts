import type { DWMError } from "../errors/DWMError.js";

export interface ShutdownFailure {
  kind: "module" | "adapter";
  id: string;
  error: DWMError;
}

/**
 * Resultado del apagado ordenado (README §12, regla F). `shutdown()` nunca
 * lanza por un fallo aislado de un `dispose()`: intenta liberar todos los
 * módulos y adaptadores registrados, agrega cualquier fallo en `failures` y
 * completa el apagado alcanzando `STOPPED` en cualquier caso. Cada fallo
 * también se emite individualmente mediante `core:error`.
 */
export interface ShutdownReport {
  failures: ShutdownFailure[];
}
