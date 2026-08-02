import { describe, it, expect } from "vitest";
import { AIProviderRegistry } from "../../src/AIProviderRegistry.js";
import { AIHealthMonitor } from "../../src/AIHealthMonitor.js";
import { makeFakeProvider } from "./support/fakeProvider.js";

describe("AIHealthMonitor", () => {
  it("checkProvider() marca connected cuando el proveedor está sano", async () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1", healthy: true }));
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 100,
      resolveCredential: async () => undefined,
    });

    const healthy = await monitor.checkProvider("p1");

    expect(healthy).toBe(true);
    expect(registry.getConnection("p1")?.status).toBe("connected");
  });

  it("checkProvider() marca error cuando el proveedor no está sano", async () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1", healthy: false }));
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 100,
      resolveCredential: async () => undefined,
    });

    const healthy = await monitor.checkProvider("p1");

    expect(healthy).toBe(false);
    expect(registry.getConnection("p1")?.status).toBe("error");
  });

  it("checkProvider() resuelve la credencial declarada antes de comprobar", async () => {
    const registry = new AIProviderRegistry();
    let receivedCredential: string | undefined;
    registry.register(
      makeFakeProvider({ id: "p1", onHealthCheck: (c) => (receivedCredential = c) }),
      "cred-key"
    );
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 100,
      resolveCredential: async (key) => `valor-de-${key}`,
    });

    await monitor.checkProvider("p1");

    expect(receivedCredential).toBe("valor-de-cred-key");
  });

  it("checkProvider() se marca en error si el health check supera el timeout", async () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1", hangHealthCheck: true }));
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 20,
      resolveCredential: async () => undefined,
    });

    const healthy = await monitor.checkProvider("p1");

    expect(healthy).toBe(false);
    expect(registry.getConnection("p1")?.status).toBe("error");
  });

  it("checkProvider() invoca onChecked con el resultado", async () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1", healthy: true }));
    const calls: Array<[string, boolean]> = [];
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 100,
      resolveCredential: async () => undefined,
      onChecked: (id, healthy) => calls.push([id, healthy]),
    });

    await monitor.checkProvider("p1");

    expect(calls).toEqual([["p1", true]]);
  });

  it("checkAll() comprueba todos los proveedores registrados", async () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1", healthy: true }));
    registry.register(makeFakeProvider({ id: "p2", healthy: false }));
    const monitor = new AIHealthMonitor({
      registry,
      timeoutMs: 100,
      resolveCredential: async () => undefined,
    });

    const results = await monitor.checkAll();

    expect(results.get("p1")).toBe(true);
    expect(results.get("p2")).toBe(false);
  });
});
