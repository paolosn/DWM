import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { McpStdioConnectionAdapter } from "../../../src/adapters/McpStdioConnectionAdapter.js";
import { McpProcessSupervisor } from "../../../src/adapters/McpProcessSupervisor.js";
import { ConnectionErrorCode } from "../../../src/errors/ConnectionErrorCode.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

const fixturePath = fileURLToPath(new URL("../../fixtures/mcp-echo-server.mjs", import.meta.url));

function makeConnection(overrides: Partial<Connection["config"]> = {}): Connection {
  return {
    id: `conn-mcp-stdio-${Math.random().toString(36).slice(2)}`,
    projectId: "proj-1",
    name: "MCP local fixture",
    type: "mcp-stdio",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: { command: process.execPath, args: [fixturePath], ...overrides },
    adapterId: "mcp-stdio",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("McpStdioConnectionAdapter (proceso real, sin mocks de transporte)", () => {
  const supervisors: McpProcessSupervisor[] = [];
  afterEach(async () => {
    for (const s of supervisors.splice(0)) await s.disposeAll();
  });
  function makeAdapter(): McpStdioConnectionAdapter {
    const supervisor = new McpProcessSupervisor();
    supervisors.push(supervisor);
    return new McpStdioConnectionAdapter(supervisor);
  }

  it("test() lanza el proceso real, negocia initialize y detecta capacidades/versión", async () => {
    const adapter = makeAdapter();
    const connection = makeConnection();
    const result = await adapter.test({
      connection,
      resolvedSecrets: {},
      timeoutMs: 5000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.serviceVersion).toBe("9.9.9");
    expect([...result.capabilitiesDetected].sort()).toEqual(["resources", "tools"]);
    await adapter.dispose(connection.id);
  });

  it("discover() enumera herramientas y recursos reales del fixture; prompts vacío si el servidor no lo soporta", async () => {
    const adapter = makeAdapter();
    const connection = makeConnection();
    const discovery = await adapter.discover({
      connection,
      resolvedSecrets: {},
      timeoutMs: 5000,
      signal: new AbortController().signal,
    });
    expect(discovery.tools).toEqual([{ name: "echo", description: "Devuelve la entrada" }]);
    expect(discovery.resources).toEqual([{ uri: "fixture://readme", name: "readme" }]);
    expect(discovery.prompts).toEqual([]);
    await adapter.dispose(connection.id);
  });

  it("comando con caracteres inseguros se rechaza antes de lanzar ningún proceso", async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.test({
        connection: makeConnection({ command: "node; rm -rf /" }),
        resolvedSecrets: {},
        timeoutMs: 1000,
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ code: ConnectionErrorCode.CONNECTION_UNSAFE_COMMAND });
  });

  it("timeout: initialize() que no responde a tiempo falla de forma segura y limpia el proceso", async () => {
    const adapter = makeAdapter();
    const connection = makeConnection({
      command: process.execPath,
      args: [fixturePath, "--slow-init"],
    });
    const result = await adapter.test({
      connection,
      resolvedSecrets: {},
      timeoutMs: 300,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ConnectionErrorCode.CONNECTION_TEST_FAILED);
    expect(result.error?.message).toMatch(/Tiempo de espera agotado/);
  });

  it("dispose() cierra el proceso MCP asociado (ningún proceso queda huérfano al apagar DWM)", async () => {
    const supervisor = new McpProcessSupervisor();
    supervisors.push(supervisor);
    const adapter = new McpStdioConnectionAdapter(supervisor);
    const connection = makeConnection();
    await adapter.test({
      connection,
      resolvedSecrets: {},
      timeoutMs: 5000,
      signal: new AbortController().signal,
    });
    expect(supervisor.activeCount).toBe(1);
    await supervisor.disposeAll();
    expect(supervisor.activeCount).toBe(0);
  });
});
