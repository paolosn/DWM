import type { ApplicationOperationMap, KnownOperationName } from "@dwm/application-api";
import { DwmOperationError } from "./DwmOperationError.js";

/**
 * Módulo 33A — API Client. Único punto por el que el renderer llama al
 * motor DWM: `Renderer → API Desktop tipada → preload/contextBridge →
 * IPC seguro → Application API` (documento §3). Nunca se importa nada en
 * tiempo de ejecución de `@dwm/application-api` — el import de arriba es
 * `import type`, se borra en compilación — solo se usa `ApplicationOperationMap`
 * para tipar por nombre de operación los payloads y resultados que ya
 * definen los controladores del Módulo 31, sin retipar a mano cada uno.
 *
 * Cada llamada pasa por `window.dwm.invoke()`, expuesto por el `preload`
 * del Módulo 32. Una respuesta `success: false` se convierte en una
 * excepción `DwmOperationError` para que los hooks de consulta/mutación
 * tengan un único camino de error.
 */
export async function callOperation<Op extends KnownOperationName>(
  operation: Op,
  payload: ApplicationOperationMap[Op] extends { payload: infer P } ? P : unknown,
  options?: { readonly confirmation?: { readonly confirmed: boolean; readonly token?: string } }
): Promise<ApplicationOperationMap[Op] extends { result: infer R } ? R : unknown> {
  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${operation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const response = await window.dwm.invoke({
    requestId,
    operation,
    payload,
    ...(options?.confirmation ? { confirmation: options.confirmation } : {}),
  });

  if (!response.success) {
    throw new DwmOperationError(operation, response.error);
  }

  return response.data as ApplicationOperationMap[Op] extends { result: infer R } ? R : unknown;
}
