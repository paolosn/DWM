import type {
  ConnectionTestResult,
  ConnectionType,
  McpDiscoveredPrompt,
  McpDiscoveredResource,
  McpDiscoveredTool,
} from "../ConnectionTypes.js";
import { toSafeError } from "../ConnectionSecrets.js";
import { ConnectionErrorCode } from "../errors/ConnectionErrorCode.js";
import { createConnectionError } from "../errors/ConnectionError.js";
import type {
  ConnectionAdapter,
  ConnectionTestInput,
  McpDiscoveryResult,
} from "./ConnectionAdapter.js";
import { McpProcessSupervisor } from "./McpProcessSupervisor.js";

const UNSAFE_COMMAND_PATTERN = /[;&|`$<>\n]/;

function assertSafeCommand(command: unknown): asserts command is string {
  if (typeof command !== "string" || command.trim().length === 0) {
    throw createConnectionError({
      code: ConnectionErrorCode.CONNECTION_UNSAFE_COMMAND,
      message: 'La conexión MCP stdio requiere "command" (ejecutable) en su configuración.',
      origin: "mcp",
      recoverable: true,
    });
  }
  if (UNSAFE_COMMAND_PATTERN.test(command)) {
    throw createConnectionError({
      code: ConnectionErrorCode.CONNECTION_UNSAFE_COMMAND,
      message: "El comando de la conexión MCP stdio contiene caracteres no permitidos.",
      origin: "mcp",
      recoverable: true,
    });
  }
}

function buildEnv(resolvedSecrets: Readonly<Record<string, string>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolvedSecrets)) {
    if (key.startsWith("env.")) {
      env[key.slice("env.".length)] = value;
    }
  }
  return env;
}

/**
 * Conector real mínimo para servidores MCP mediante transporte stdio
 * (README "Conectores reales mínimos" #1). Lanza el proceso con argumentos
 * separados (nunca una shell concatenada), negocia `initialize` por
 * JSON-RPC 2.0 y, en `discover()`, enumera herramientas, recursos y
 * prompts declarados por el servidor.
 */
export class McpStdioConnectionAdapter implements ConnectionAdapter {
  readonly adapterId = "mcp-stdio";
  readonly supportedTypes: readonly ConnectionType[] = ["mcp-stdio"];

  constructor(private readonly supervisor: McpProcessSupervisor = new McpProcessSupervisor()) {}

  private session(input: ConnectionTestInput) {
    const { config } = input.connection;
    assertSafeCommand(config["command"]);
    const args = Array.isArray(config["args"]) ? (config["args"] as string[]) : [];
    const cwd = typeof config["cwd"] === "string" ? (config["cwd"] as string) : undefined;
    return this.supervisor.getOrCreate(input.connection.id, {
      command: config["command"] as string,
      args,
      env: buildEnv(input.resolvedSecrets),
      ...(cwd ? { cwd } : {}),
    });
  }

  async test(input: ConnectionTestInput): Promise<ConnectionTestResult> {
    const startedAt = Date.now();
    const session = this.session(input);
    try {
      const result = (await session.request(
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "dwm-connections-manager", version: "1.0.0" },
        },
        input.timeoutMs
      )) as { serverInfo?: { version?: string }; capabilities?: Record<string, unknown> };
      const latencyMs = Date.now() - startedAt;
      const capabilitiesDetected = result?.capabilities ? Object.keys(result.capabilities) : [];
      return {
        success: true,
        latencyMs,
        capabilitiesDetected,
        ...(result?.serverInfo?.version ? { serviceVersion: result.serverInfo.version } : {}),
        warnings: [],
        error: null,
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      await this.supervisor.dispose(input.connection.id);
      const message =
        err instanceof Error ? err.message : "Fallo desconocido al probar el servidor MCP.";
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

  async discover(input: ConnectionTestInput): Promise<McpDiscoveryResult> {
    const session = this.session(input);
    await session.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "dwm-connections-manager", version: "1.0.0" },
      },
      input.timeoutMs
    );
    const tools = await this.safeList<McpDiscoveredTool>(
      session,
      "tools/list",
      "tools",
      input.timeoutMs
    );
    const resources = await this.safeList<McpDiscoveredResource>(
      session,
      "resources/list",
      "resources",
      input.timeoutMs
    );
    const prompts = await this.safeList<McpDiscoveredPrompt>(
      session,
      "prompts/list",
      "prompts",
      input.timeoutMs
    );
    return { tools, resources, prompts };
  }

  private async safeList<T>(
    session: ReturnType<McpStdioConnectionAdapter["session"]>,
    method: string,
    field: string,
    timeoutMs: number
  ): Promise<readonly T[]> {
    try {
      const result = (await session.request(method, {}, timeoutMs)) as Record<string, unknown>;
      const list = result?.[field];
      return Array.isArray(list) ? (list as T[]) : [];
    } catch {
      // El servidor puede no exponer esta categoría (p. ej. sin prompts); no es un fallo de la prueba.
      return [];
    }
  }

  async dispose(connectionId: string): Promise<void> {
    await this.supervisor.dispose(connectionId);
  }
}
