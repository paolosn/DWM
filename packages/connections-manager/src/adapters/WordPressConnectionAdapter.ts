import type { ConnectionTestResult, ConnectionType } from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type { ConnectionAdapter, ConnectionTestInput } from "./ConnectionAdapter.js";
import type { FetchLike } from "./McpRemoteConnectionAdapter.js";

/**
 * Conector real mínimo para WordPress REST API (README "Conectores
 * reales mínimos" #3). La prueba de conexión consulta el índice público
 * `/wp-json/` (nunca destructivo) usando autenticación básica de
 * aplicación (usuario + contraseña de aplicación, ambos vía Secrets) y
 * reporta los namespaces detectados como capacidades.
 */
export class WordPressConnectionAdapter implements ConnectionAdapter {
  readonly adapterId = "wordpress-rest";
  readonly supportedTypes: readonly ConnectionType[] = ["wordpress-rest"];

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const baseUrl = input.connection.config["url"];
    if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: 'La conexión WordPress REST requiere "url" en su configuración.',
        origin: "adapter",
        recoverable: true,
      });
    }
    const username = input.resolvedSecrets["username"];
    const appPassword = input.resolvedSecrets["appPassword"];
    const headers: Record<string, string> = {};
    if (username && appPassword) {
      headers["authorization"] =
        `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
    }
    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/wp-json/`;
      const response = await this.fetchImpl(endpoint, {
        method: "GET",
        headers,
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
            `WordPress respondió con estado HTTP ${response.status}.`,
            input.resolvedSecrets
          ),
          testedAt: new Date().toISOString(),
        };
      }
      const body = (await response.json()) as { name?: string; namespaces?: string[] };
      return {
        success: true,
        latencyMs,
        capabilitiesDetected: Array.isArray(body.namespaces) ? body.namespaces : [],
        warnings: [],
        error: null,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Fallo desconocido al probar WordPress REST.";
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
