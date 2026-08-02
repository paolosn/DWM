import { describe, it, expect, vi } from "vitest";
import { WordPressConnectionAdapter } from "../../../src/adapters/WordPressConnectionAdapter.js";
import type { Connection } from "../../../src/ConnectionTypes.js";

function makeConnection(): Connection {
  return {
    id: "conn-wp",
    projectId: "proj-1",
    name: "WordPress Producción",
    type: "wordpress-rest",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: { url: "https://example.test" },
    adapterId: "wordpress-rest",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("WordPressConnectionAdapter", () => {
  it("test() consulta /wp-json/ y expone los namespaces como capacidades detectadas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ name: "Sitio de prueba", namespaces: ["wp/v2", "mci/v1"] }),
    });
    const adapter = new WordPressConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { username: "admin", appPassword: "app-pass-value" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(true);
    expect(result.capabilitiesDetected).toEqual(["wp/v2", "mci/v1"]);
    const [, options] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers.authorization).toMatch(/^Basic /);
  });

  it("test() reporta fallo seguro si el sitio responde con error HTTP", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const adapter = new WordPressConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: {},
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("401");
  });

  it("test() lanza un error de validación si falta url", async () => {
    const adapter = new WordPressConnectionAdapter(vi.fn() as unknown as typeof fetch);
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

  it("una excepción de red se reporta como fallo seguro y redacta la contraseña de aplicación", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout contra clave-app-real"));
    const adapter = new WordPressConnectionAdapter(fetchImpl as unknown as typeof fetch);
    const result = await adapter.test({
      connection: makeConnection(),
      resolvedSecrets: { username: "admin", appPassword: "clave-app-real" },
      timeoutMs: 1000,
      signal: new AbortController().signal,
    });
    expect(result.success).toBe(false);
    expect(result.error?.message).not.toContain("clave-app-real");
  });
});
