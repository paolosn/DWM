import type { AIRequest } from "./AIRequest.js";
import type { AIResponse } from "./AIResponse.js";

/**
 * Contrato mínimo que debe cumplir cualquier proveedor de IA. `credential`
 * es el valor ya resuelto (descifrado) que `AIManager` obtiene de
 * `@dwm/secrets` en el momento de la llamada; el proveedor nunca lo retiene
 * más allá de la propia invocación.
 */
export interface AIProvider {
  readonly id: string;
  readonly name: string;
  sendRequest(
    request: AIRequest,
    credential: string | undefined
  ): Promise<Omit<AIResponse, "providerId" | "attempt" | "latencyMs">>;
  healthCheck(credential: string | undefined): Promise<boolean>;
}
