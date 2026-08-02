import type {
  Connection,
  ConnectionTestResult,
  ConnectionType,
  McpDiscoveredPrompt,
  McpDiscoveredResource,
  McpDiscoveredTool,
} from "../ConnectionTypes.js";

export interface ConnectionTestInput {
  readonly connection: Connection;
  /** Valores de secreto ya resueltos vía @dwm/secrets; nunca se persisten ni se registran tal cual. */
  readonly resolvedSecrets: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
}

export interface McpDiscoveryResult {
  readonly tools: readonly McpDiscoveredTool[];
  readonly resources: readonly McpDiscoveredResource[];
  readonly prompts: readonly McpDiscoveredPrompt[];
}

/**
 * Contrato que implementa cada conector real (README "Conectores reales
 * mínimos"). `test()` nunca realiza acciones destructivas; solo verifica
 * alcanzabilidad/autenticación y, cuando el protocolo lo permite, detecta
 * capacidades y versión del servicio. `discover()` es exclusivo de
 * adaptadores MCP.
 */
export interface ConnectionAdapter {
  readonly adapterId: string;
  readonly supportedTypes: readonly ConnectionType[];
  test(input: ConnectionTestInput): Promise<ConnectionTestResult>;
  discover?(input: ConnectionTestInput): Promise<McpDiscoveryResult>;
  /** Libera cualquier proceso o conexión abierta asociada a `connectionId` (p. ej. proceso MCP stdio). */
  dispose?(connectionId: string): Promise<void>;
}
