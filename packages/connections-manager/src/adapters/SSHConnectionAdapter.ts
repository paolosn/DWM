import type { ConnectionTestResult, ConnectionType } from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type { ConnectionAdapter, ConnectionTestInput } from "./ConnectionAdapter.js";

export interface SSHTestOptions {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  /** Contraseña o passphrase de clave privada, ya resuelta desde Secrets. */
  readonly password?: string;
  readonly privateKey?: string;
  readonly fingerprint?: string;
  readonly timeoutMs: number;
}

export interface SSHTestOutcome {
  readonly success: boolean;
  readonly serverVersion?: string;
  readonly warnings?: readonly string[];
  readonly errorMessage?: string;
}

/**
 * Puerto inyectable para SSH/SFTP (README "Conectores reales mínimos" #4:
 * "SSH/SFTP mediante adaptador seguro o abstracción inyectable"). El
 * paquete `@dwm/connections-manager` no incluye un cliente SSH propio
 * (evita dependencias nativas de compilación en el motor); quien compone
 * el Engine (Desktop App) inyecta la implementación real (p. ej. sobre
 * `ssh2`). Sin puerto inyectado, `test()` reporta un fallo real y
 * explícito — nunca simula una conexión exitosa (README "No simular que
 * una conexión funciona").
 */
export interface SSHClientPort {
  testConnection(options: SSHTestOptions): Promise<SSHTestOutcome>;
}

export class SSHConnectionAdapter implements ConnectionAdapter {
  readonly adapterId: string;
  readonly supportedTypes: readonly ConnectionType[];

  constructor(
    private readonly port: SSHClientPort | undefined,
    variant: "ssh" | "sftp" = "ssh"
  ) {
    this.adapterId = variant === "sftp" ? "sftp" : "ssh";
    this.supportedTypes = [variant];
  }

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const { config } = input.connection;
    const host = config["host"];
    const username = config["username"];
    if (typeof host !== "string" || host.trim().length === 0 || typeof username !== "string") {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: 'La conexión SSH/SFTP requiere "host" y "username" en su configuración.',
        origin: "adapter",
        recoverable: true,
      });
    }
    if (!this.port) {
      return {
        success: false,
        latencyMs: Date.now() - startedAt,
        capabilitiesDetected: [],
        warnings: [],
        error: toSafeError(
          ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE,
          "Adaptador no disponible en esta versión: no hay un cliente SSH/SFTP inyectado en este Engine.",
          input.resolvedSecrets
        ),
        testedAt: new Date().toISOString(),
      };
    }
    const port = typeof config["port"] === "number" ? (config["port"] as number) : 22;
    try {
      const outcome = await this.port.testConnection({
        host,
        port,
        username,
        ...(input.resolvedSecrets["password"]
          ? { password: input.resolvedSecrets["password"] }
          : {}),
        ...(input.resolvedSecrets["privateKey"]
          ? { privateKey: input.resolvedSecrets["privateKey"] }
          : {}),
        ...(typeof config["fingerprint"] === "string"
          ? { fingerprint: config["fingerprint"] as string }
          : {}),
        timeoutMs: input.timeoutMs,
      });
      const latencyMs = Date.now() - startedAt;
      return {
        success: outcome.success,
        latencyMs,
        capabilitiesDetected: [],
        ...(outcome.serverVersion ? { serviceVersion: outcome.serverVersion } : {}),
        warnings: outcome.warnings ?? [],
        error: outcome.success
          ? null
          : toSafeError(
              ConnectionErrorCode.CONNECTION_TEST_FAILED,
              outcome.errorMessage ?? "Fallo al conectar por SSH/SFTP.",
              input.resolvedSecrets
            ),
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fallo desconocido al probar SSH/SFTP.";
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
