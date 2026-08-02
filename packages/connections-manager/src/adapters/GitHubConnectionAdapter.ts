import type { ConnectionTestResult, ConnectionType } from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type { ConnectionAdapter, ConnectionTestInput } from "./ConnectionAdapter.js";
import type { FetchLike } from "./McpRemoteConnectionAdapter.js";

/**
 * Conector real mínimo para GitHub mediante token/API (README "Conectores
 * reales mínimos" #6): verifica el token consultando `GET /user` y
 * reporta los scopes autorizados (cabecera `x-oauth-scopes`) como
 * capacidades detectadas. Sin llamadas reales en las pruebas
 * (`fetchImpl` inyectable).
 */
export class GitHubConnectionAdapter implements ConnectionAdapter {
  readonly adapterId = "github";
  readonly supportedTypes: readonly ConnectionType[] = ["github"];

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly apiBaseUrl = "https://api.github.com"
  ) {}

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const token = input.resolvedSecrets["token"];
    if (!token) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_SECRET_MISSING,
        message: 'La conexión GitHub requiere una referencia a secreto "token".',
        origin: "secret",
        recoverable: true,
      });
    }
    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}/user`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
        },
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
            `GitHub respondió con estado HTTP ${response.status}.`,
            input.resolvedSecrets
          ),
          testedAt: new Date().toISOString(),
        };
      }
      const scopesHeader = response.headers.get("x-oauth-scopes") ?? "";
      const capabilitiesDetected = scopesHeader
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return {
        success: true,
        latencyMs,
        capabilitiesDetected,
        warnings: [],
        error: null,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fallo desconocido al probar GitHub.";
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
