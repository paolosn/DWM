import { describe, it, expect, vi } from "vitest";
import { McpRemoteConnectionAdapter } from "../../../src/adapters/McpRemoteConnectionAdapter.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

function makeConnection(): Connection {
  return {
    id: "conn-mcp-remote",
    projectId: "proj-1",
    name: "MCP remoto",
    type: "mcp-remote",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: { endpoint: "https://mcp.example.test/rpc" },
    adapterId: "mcp-remote",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("McpRemoteConnectionAdapter", () => {
  it("test() envía initialize por JSON-RPC y reporta éxito con capacidades detectadas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { serverInfo: { version: "1.2.3" }, capabilities: { tools: {}, resources: {} } },
      }),
    });
    const adapter = new McpRemoteConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.serviceVersion).toBe("1.2.3");
    expect([...result.capabilitiesDetected].sort()).toEqual(["resources", "tools"]);

    const [, options] = fetchImpl.mock.calls[0] as [string, { body: string }];
    const payload = JSON.parse(options.body) as { method: string };
    expect(payload.method).toBe("initialize");
  });

  it("test() reporta el error JSON-RPC del servidor de forma segura", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: "no autorizado" } }),
    });
    const adapter = new McpRemoteConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("no autorizado");
  });

  it("test() lanza un error de validación si falta endpoint", async () => {
    const adapter = new McpRemoteConnectionAdapter(vi.fn() as unknown as typeof fetch);
    const connection = makeConnection();
    await expect(
      adapter.test({
        connection: { ...connection, config: {} },
        resolvedSecrets: {},
        timeoutMs: 1000,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
  });

  it("test() reporta fallo seguro cuando la respuesta HTTP no es ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const adapter = new McpRemoteConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("502");
  });

  it("una excepción de red se reporta como fallo seguro, sin propagar la excepción cruda", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const adapter = new McpRemoteConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("network down");
  });
});
