import type { SecretsManager } from "@dwm/secrets";
import type { Connection, ConnectionTestResult } from "./ConnectionTypes.js";
import { toSafeError } from "./ConnectionSecrets.js";
import type { ConnectionAdapterRegistry } from "./ConnectionAdapterRegistry.js";
import { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ConnectionTestOptions {
  /** Señal externa de cancelación (p. ej. el usuario cancela desde la UI). */
  readonly signal?: AbortSignal;
}

/**
 * Orquesta la prueba de una conexión: resuelve sus `secretReferences`
 * exclusivamente en memoria (nunca los persiste, registra ni devuelve),
 * aplica el timeout configurado (o el valor por defecto), delega en el
 * adaptador correspondiente y garantiza que ningún valor de secreto
 * sobreviva en el resultado devuelto. Si no existe adaptador para el
 * tipo de la conexión, reporta `adapter-unavailable` sin fingir nada.
 */
export class ConnectionTester {
  constructor(
    private readonly adapterRegistry: ConnectionAdapterRegistry,
    private readonly secretsManager?: SecretsManager
  ) {}

  async test(
    connection: Connection,
    options: ConnectionTestOptions = {}
  ): Promise<ConnectionTestResult> {
    const resolvedSecrets = await this.resolveSecrets(connection);
    const adapter = this.adapterRegistry.get(connection.type);
    if (!adapter) {
      return {
        success: false,
        latencyMs: 0,
        capabilitiesDetected: [],
        warnings: [],
        error: toSafeError(
          ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE,
          "Adaptador no disponible en esta versión.",
          resolvedSecrets
        ),
        testedAt: new Date().toISOString(),
      };
    }

    const timeoutMs =
      typeof connection.config["timeoutMs"] === "number"
        ? (connection.config["timeoutMs"] as number)
        : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onExternalAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const testPromise = adapter.test({
        connection,
        resolvedSecrets,
        timeoutMs,
        signal: controller.signal,
      });
      const timeoutPromise = new Promise<ConnectionTestResult>((resolve) => {
        controller.signal.addEventListener("abort", () => {
          resolve({
            success: false,
            latencyMs: timeoutMs,
            capabilitiesDetected: [],
            warnings: [],
            error: toSafeError(
              options.signal?.aborted
                ? ConnectionErrorCode.CONNECTION_TEST_CANCELLED
                : ConnectionErrorCode.CONNECTION_TEST_TIMEOUT,
              options.signal?.aborted
                ? "La prueba de conexión fue cancelada."
                : `La prueba de conexión superó el tiempo máximo de ${timeoutMs} ms.`,
              resolvedSecrets
            ),
            testedAt: new Date().toISOString(),
          });
        });
      });
      return await Promise.race([testPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  /** Resuelve `secretReferences` a valores en claro, solo en memoria, para el ciclo de vida de esta prueba. */
  async resolveSecrets(connection: Connection): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    if (!this.secretsManager) return resolved;
    for (const [name, secretKey] of Object.entries(connection.secretReferences)) {
      const value = await this.secretsManager.getSecret(secretKey);
      if (value !== undefined) resolved[name] = value;
    }
    return resolved;
  }
}
