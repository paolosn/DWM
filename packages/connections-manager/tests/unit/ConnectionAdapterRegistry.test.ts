import { describe, it, expect } from "vitest";
import { ConnectionAdapterRegistry } from "../../src/ConnectionAdapterRegistry.js";

describe("ConnectionAdapterRegistry", () => {
  it("isAvailable() es verdadero para los conectores reales mínimos y falso para el resto", () => {
    const registry = new ConnectionAdapterRegistry();
    expect(registry.isAvailable("http")).toBe(true);
    expect(registry.isAvailable("wordpress-rest")).toBe(true);
    expect(registry.isAvailable("github")).toBe(true);
    expect(registry.isAvailable("mcp-stdio")).toBe(true);
    expect(registry.isAvailable("mcp-remote")).toBe(true);
    expect(registry.isAvailable("ssh")).toBe(true);
    expect(registry.isAvailable("sftp")).toBe(true);
    expect(registry.isAvailable("cloudflare")).toBe(false);
    expect(registry.isAvailable("metricool")).toBe(false);
  });

  it("getById() localiza un adaptador por su adapterId", () => {
    const registry = new ConnectionAdapterRegistry();
    expect(registry.getById("http")?.adapterId).toBe("http");
    expect(registry.getById("no-existe")).toBeUndefined();
  });

  it("register() permite sustituir el adaptador de un tipo (conector personalizado futuro)", () => {
    const registry = new ConnectionAdapterRegistry();
    const custom = {
      adapterId: "custom-crm",
      supportedTypes: ["custom" as const],
      test: async () => ({
        success: true,
        latencyMs: 0,
        capabilitiesDetected: [],
        warnings: [],
        error: null,
        testedAt: new Date().toISOString(),
      }),
    };
    registry.register(custom);
    expect(registry.get("custom")).toBe(custom);
    expect(registry.getById("custom-crm")).toBe(custom);
  });

  it("disposeAll() libera los procesos MCP activos sin lanzar", async () => {
    const registry = new ConnectionAdapterRegistry();
    await expect(registry.disposeAll()).resolves.toBeUndefined();
  });
});
