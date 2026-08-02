import type { ConnectionTestResult, ConnectionType } from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type { ConnectionAdapter, ConnectionTestInput } from "./ConnectionAdapter.js";

export type FetchLike = typeof fetch;

function buildHeaders(resolvedSecrets: Readonly<Record<string, string>>): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  for (const [key, value] of Object.entries(resolvedSecrets)) {
    if (key.startsWith("header.")) {
      headers[key.slice("header.".length)] = value;
    }
  }
  return headers;
}

/**
 * Conector real mínimo para servidores MCP remotos (README "Conectores
 * reales mínimos" #2), usando el transporte HTTP/JSON-RPC permitido por
 * el protocolo MCP: envía `initialize` como una petición JSON-RPC 2.0 al
 * `endpoint` configurado y valida la respuesta. `fetchImpl` es
 * inyectable para pruebas sin red real.
 */
export class McpRemoteConnectionAdapter implements ConnectionAdapter {
  readonly adapterId = "mcp-remote";
  readonly supportedTypes: readonly ConnectionType[] = ["mcp-remote"];

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const endpoint = input.connection.config["endpoint"];
    if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: 'La conexión MCP remota requiere "endpoint" en su configuración.',
        origin: "mcp",
        recoverable: true,
      });
    }
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: buildHeaders(input.resolvedSecrets),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "dwm-connections-manager", version: "1.0.0" },
          },
        }),
        signal: input.signal,
      });
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        return {
          success: false,
          latencyMs,
          capabilitiesDetected: [],
          warnings: [],
          error: toSafeError(
            ConnectionErrorCode.CONNECTION_TEST_FAILED,
            `El servidor MCP remoto respondió con estado HTTP ${response.status}.`,
            input.resolvedSecrets
          ),
          testedAt: new Date().toISOString(),
        };
      }
      const body = (await response.json()) as {
        result?: { serverInfo?: { version?: string }; capabilities?: Record<string, unknown> };
        error?: { message?: string };
      };
      if (body.error) {
        return {
          success: false,
          latencyMs,
          capabilitiesDetected: [],
          warnings: [],
          error: toSafeError(
            ConnectionErrorCode.CONNECTION_MCP_PROTOCOL_ERROR,
            body.error.message ?? "Error JSON-RPC del servidor MCP remoto.",
            input.resolvedSecrets
          ),
          testedAt: new Date().toISOString(),
        };
      }
      const capabilities = body.result?.capabilities ? Object.keys(body.result.capabilities) : [];
      return {
        success: true,
        latencyMs,
        capabilitiesDetected: capabilities,
        ...(body.result?.serverInfo?.version
          ? { serviceVersion: body.result.serverInfo.version }
          : {}),
        warnings: [],
        error: null,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Fallo desconocido al probar el servidor MCP remoto.";
      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        capabilitiesDetected: [],
        warnings: [],
        error: toSafeError(
          ConnectionErrorCode.CONNECTION_TEST_FAILED,
          message,
          input.resolvedSecrets
        ),
        testedAt: new Date().toISOString(),
      };
    }
  }
}
