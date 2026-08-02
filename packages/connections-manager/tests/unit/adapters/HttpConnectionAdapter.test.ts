import { describe, it, expect, vi } from "vitest";
import { HttpConnectionAdapter } from "../../../src/adapters/HttpConnectionAdapter.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "conn-http",
    projectId: "proj-1",
    name: "API genérica",
    type: "http",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: { baseUrl: "https://example.test/health" },
    adapterId: "http",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
    ...overrides,
  };
}

describe("HttpConnectionAdapter", () => {
  it("test() reporta éxito cuando la respuesta HTTP es ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const adapter = new HttpConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
  });

  it("test() reporta fallo seguro cuando la respuesta HTTP no es ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const adapter = new HttpConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("503");
  });

  it("test() nunca incluye el valor de un secreto resuelto en el mensaje de error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fallo contra token-secreto-xyz"));
    const adapter = new HttpConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { token: "token-secreto-xyz" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toContain("token-secreto-xyz");
  });

  it("test() lanza un error de validación si falta baseUrl", async () => {
    const adapter = new HttpConnectionAdapter();
    await expect(
      adapter.test({
        connection: makeConnection({ config: {} }),
        resolvedSecrets: {},
        timeoutMs: 1000,
        signal: new AbortController().signal,
      })
    ).rejects.toThrow();
  });
});
