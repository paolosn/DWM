import type { ConnectionTestResult, ConnectionType } from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type { ConnectionAdapter, ConnectionTestInput } from "./ConnectionAdapter.js";
import type { FetchLike } from "./McpRemoteConnectionAdapter.js";

/**
 * Conector real mínimo HTTP/API genérico (README "Conectores reales
 * mínimos" #5): realiza la petición configurada (método, URL base,
 * cabeceras seguras vía referencias a Secrets) y reporta el estado HTTP
 * como éxito/fallo. No asume ningún formato de respuesta concreto.
 */
export class HttpConnectionAdapter implements ConnectionAdapter {
  readonly adapterId = "http";
  readonly supportedTypes: readonly ConnectionType[] = ["http"];

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const baseUrl = input.connection.config["baseUrl"];
    if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: 'La conexión HTTP genérica requiere "baseUrl" en su configuración.',
        origin: "adapter",
        recoverable: true,
      });
    }
    const method =
      typeof input.connection.config["method"] === "string"
        ? (input.connection.config["method"] as string)
        : "GET";
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(input.resolvedSecrets)) {
      if (key.startsWith("header.")) headers[key.slice("header.".length)] = value;
    }
    try {
      const response = await this.fetchImpl(baseUrl, { method, headers, signal: input.signal });
      const latencyMs = Date.now() - startedAt;
      return {
        success: response.ok,
        latencyMs,
        capabilitiesDetected: [],
        warnings: response.ok ? [] : [`Estado HTTP ${response.status}.`],
        error: response.ok
          ? null
          : toSafeError(
              ConnectionErrorCode.CONNECTION_TEST_FAILED,
              `La URL respondió con estado HTTP ${response.status}.`,
              input.resolvedSecrets
            ),
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Fallo desconocido al probar la conexión HTTP.";
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
