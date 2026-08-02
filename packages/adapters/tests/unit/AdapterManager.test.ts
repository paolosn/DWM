import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { AdapterManager } from "../../src/AdapterManager.js";
import { AdapterErrorCode } from "../../src/errors/AdapterErrorCode.js";
import { defaultAdapterConfiguration } from "../../src/AdapterConfiguration.js";
import { FakeAdapter } from "./support/FakeAdapter.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "dwm-adapter-manager-"));
}
function cfg(overrides: Partial<ReturnType<typeof defaultAdapterConfiguration>> = {}) {
  return { ...defaultAdapterConfiguration(), ...overrides };
}

describe("AdapterManager — registro y descubrimiento", () => {
  it("registerAdapter() registra; discoverAdapters()/listAdapters() lo reflejan", () => {
    const manager = new AdapterManager();
    manager.registerAdapter(new FakeAdapter({ id: "a" }));
    expect(manager.discoverAdapters()).toEqual(["a"]);
    expect(manager.listAdapters()).toEqual(["a"]);
    expect(manager.getState("a")).toBe("registered");
  });

  it("registerAdapterFactory() construye y registra", async () => {
    const manager = new AdapterManager();
    const adapter = await manager.registerAdapterFactory({
      subject: new FakeAdapter().subject,
      create: () => new FakeAdapter({ id: "a" }),
    });
    expect(adapter.id).toBe("a");
    expect(manager.listAdapters()).toEqual(["a"]);
  });

  it("registerAdapter() rechaza configuración inválida", () => {
    const manager = new AdapterManager();
    expect(() =>
      manager.registerAdapter(new FakeAdapter({ id: "a" }), {
        enabled: "si" as never,
        priority: 0,
        dependencies: [],
      })
    ).toThrow(expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION }));
  });

  it("unregisterAdapter() libera (dispose) y elimina del registro; lanza si no existe", async () => {
    const manager = new AdapterManager();
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await manager.unregisterAdapter("a");
    expect(adapter.disposeCount).toBe(1);
    expect(manager.listAdapters()).toEqual([]);
    await expect(manager.unregisterAdapter("a")).rejects.toMatchObject({
      code: AdapterErrorCode.ADAPTER_NOT_FOUND,
    });
  });
});

describe("AdapterManager — ciclo de vida", () => {
  it("initializeAdapter() invoca onInit y transiciona a 'initialized'", async () => {
    const manager = new AdapterManager();
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await manager.initializeAdapter("a");
    expect(adapter.initCount).toBe(1);
    expect(manager.getState("a")).toBe("initialized");
  });

  it("initializeAdapter() transiciona a 'error' y envuelve el fallo si onInit lanza", async () => {
    const manager = new AdapterManager();
    manager.registerAdapter(new FakeAdapter({ id: "a", failInit: true }));
    await expect(manager.initializeAdapter("a")).rejects.toMatchObject({
      code: AdapterErrorCode.ADAPTER_INIT_FAILED,
    });
    expect(manager.getState("a")).toBe("error");
  });

  it("initializeAll() respeta el orden por dependencias y prioridad", async () => {
    const manager = new AdapterManager();
    const order: string[] = [];
    manager.registerAdapter(
      new FakeAdapter({ id: "consumer", onInit: () => order.push("consumer") }),
      cfg({ dependencies: ["provider"] })
    );
    manager.registerAdapter(
      new FakeAdapter({ id: "provider", onInit: () => order.push("provider") }),
      cfg()
    );

    await manager.initializeAll();

    expect(order).toEqual(["provider", "consumer"]);
  });

  it("activateAdapter()/deactivateAdapter() invocan los hooks y transicionan el estado", async () => {
    const manager = new AdapterManager();
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await manager.initializeAdapter("a");

    await manager.activateAdapter("a");
    expect(adapter.activateCount).toBe(1);
    expect(manager.getState("a")).toBe("active");

    await manager.deactivateAdapter("a");
    expect(adapter.deactivateCount).toBe(1);
    expect(manager.getState("a")).toBe("inactive");
  });

  it("activateAdapter()/deactivateAdapter() transicionan a 'error' y envuelven el fallo", async () => {
    const manager = new AdapterManager();
    manager.registerAdapter(new FakeAdapter({ id: "a", failActivate: true }));
    await manager.initializeAdapter("a");
    await expect(manager.activateAdapter("a")).rejects.toMatchObject({
      code: AdapterErrorCode.ADAPTER_ACTIVATE_FAILED,
    });
    expect(manager.getState("a")).toBe("error");

    const manager2 = new AdapterManager();
    manager2.registerAdapter(new FakeAdapter({ id: "b", failDeactivate: true }));
    await manager2.initializeAdapter("b");
    await manager2.activateAdapter("b");
    await expect(manager2.deactivateAdapter("b")).rejects.toMatchObject({
      code: AdapterErrorCode.ADAPTER_DEACTIVATE_FAILED,
    });
  });

  it("reloadAdapter() desde 'active' vuelve a dejarlo activo", async () => {
    const manager = new AdapterManager();
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await manager.initializeAdapter("a");
    await manager.activateAdapter("a");

    await manager.reloadAdapter("a");

    expect(adapter.disposeCount).toBe(1);
    expect(adapter.initCount).toBe(2);
    expect(adapter.activateCount).toBe(2);
    expect(manager.getState("a")).toBe("active");
  });

  it("reloadAdapter() desde 'inactive' no reactiva", async () => {
    const manager = new AdapterManager();
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await manager.initializeAdapter("a");
    await manager.activateAdapter("a");
    await manager.deactivateAdapter("a");

    await manager.reloadAdapter("a");

    expect(manager.getState("a")).toBe("initialized");
    expect(adapter.activateCount).toBe(1);
  });
});

describe("AdapterManager — capacidades y salud", () => {
  it("getCapabilities() devuelve las capacidades declaradas por el adaptador", () => {
    const manager = new AdapterManager();
    const capabilities = { provided: [{ name: "cap.a", version: "1.0.0" }], required: [] };
    manager.registerAdapter(new FakeAdapter({ id: "a", capabilities }));
    expect(manager.getCapabilities("a")).toEqual(capabilities);
  });

  it("checkHealth() registra la salud y notifica; checkAllHealth() cubre todos", async () => {
    const manager = new AdapterManager();
    manager.registerAdapter(new FakeAdapter({ id: "a", healthy: true }));
    manager.registerAdapter(new FakeAdapter({ id: "b", healthy: false }));

    const results = await manager.checkAllHealth();

    expect(results.map((h) => h.healthy)).toEqual([true, false]);
    expect(manager.getHealth("a")?.healthy).toBe(true);
    expect(manager.getHealth("b")?.healthy).toBe(false);
  });

  it("checkHealth() envuelve un fallo del propio checkHealth() del adaptador", async () => {
    const manager = new AdapterManager();
    manager.registerAdapter(new FakeAdapter({ id: "a", failHealthCheck: true }));

    const health = await manager.checkHealth("a");

    expect(health.healthy).toBe(false);
    expect(health.detail).toBeDefined();
  });
});

describe("AdapterManager — eventos, logging, secretos e IA", () => {
  it("publica eventos completos a través de un EventBus inyectado", async () => {
    const published: string[] = [];
    const fakeBus = {
      publish: async (type: string) => {
        published.push(type);
        return {
          eventId: "e",
          type,
          matched: 0,
          delivered: 0,
          cancelledByMiddleware: false,
          propagationStopped: false,
          errors: [],
        };
      },
    };
    const manager = new AdapterManager({ eventBus: fakeBus as never });
    manager.registerAdapter(new FakeAdapter({ id: "a" }));
    await manager.initializeAdapter("a");
    await manager.activateAdapter("a");
    await manager.deactivateAdapter("a");
    await manager.checkHealth("a");
    await manager.unregisterAdapter("a");

    expect(published).toEqual([
      "adapters.registered",
      "adapters.initialized",
      "adapters.activated",
      "adapters.deactivated",
      "adapters.health.ok",
      "adapters.disposed",
      "adapters.unregistered",
    ]);
  });

  it("registra el ciclo de vida a través de un Logger inyectado", async () => {
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({
        info: async (m: string) => void logs.push(m),
        error: async (m: string) => void logs.push(m),
      }),
    };
    const manager = new AdapterManager({ logger: fakeLogger as never });
    manager.registerAdapter(new FakeAdapter({ id: "a" }));
    await manager.initializeAdapter("a");

    expect(logs.some((m) => m.includes("adapters:initialized"))).toBe(true);
  });

  it("expone getSecret() en el contexto, resuelto mediante un SecretsManager inyectado", async () => {
    const secretsManager = { getSecret: async (key: string) => `valor-de-${key}` };
    const manager = new AdapterManager({ secretsManager: secretsManager as never });
    let resolved: string | undefined;
    manager.registerAdapter(
      new FakeAdapter({
        id: "a",
        onInit: (context) => void context.getSecret("k").then((v) => (resolved = v)),
      })
    );
    await manager.initializeAdapter("a");
    await new Promise((r) => setTimeout(r, 0));

    expect(resolved).toBe("valor-de-k");
  });

  it("getSecret() en el contexto devuelve undefined si no hay SecretsManager", async () => {
    const manager = new AdapterManager();
    let resolved: string | undefined = "no-tocado";
    manager.registerAdapter(
      new FakeAdapter({
        id: "a",
        onInit: (context) => void context.getSecret("k").then((v) => (resolved = v)),
      })
    );
    await manager.initializeAdapter("a");
    await new Promise((r) => setTimeout(r, 0));

    expect(resolved).toBeUndefined();
  });

  it("expone aiManager en el contexto cuando se inyecta", async () => {
    const fakeAiManager = { marker: "ai-manager-de-pruebas" };
    const manager = new AdapterManager({ aiManager: fakeAiManager as never });
    let receivedAiManager: unknown;
    manager.registerAdapter(
      new FakeAdapter({ id: "a", onInit: (context) => (receivedAiManager = context.aiManager) })
    );
    await manager.initializeAdapter("a");

    expect(receivedAiManager).toBe(fakeAiManager);
  });
});

describe("AdapterManager — integración con Config, Scheduler y Core", () => {
  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const manager = new AdapterManager({ configManager });
    manager.registerAdapter(new FakeAdapter({ id: "a" }));

    await core.registerModule(manager);

    expect(await configManager.getSection("adapters-manager")).toEqual({ adapters: ["a"] });

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("getConfigSection() en el contexto usa el ConfigManager inyectado", async () => {
    const configManager = new ConfigManager({ configDir: tempDir() });
    await configManager.setSection("adapter.a", { activado: true });
    const manager = new AdapterManager({ configManager });
    let received: unknown;
    manager.registerAdapter(
      new FakeAdapter({
        id: "a",
        onInit: (context) => void context.getConfigSection("adapter.a").then((v) => (received = v)),
      })
    );
    await manager.initializeAdapter("a");
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual({ activado: true });
  });

  it("programa el health check periódico a través de un Scheduler inyectado", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new AdapterManager({ scheduler, healthCheckIntervalMs: 1000 });
    manager.registerAdapter(new FakeAdapter({ id: "a" }));

    vi.useFakeTimers();
    try {
      await core.registerModule(manager);
      await vi.advanceTimersByTimeAsync(1000);
    } finally {
      vi.useRealTimers();
    }

    expect(manager.getHealth("a")).toBeDefined();

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("dispose() cancela la tarea de health check y libera todos los adaptadores registrados", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new AdapterManager({ scheduler, healthCheckIntervalMs: 1000 });
    const adapter = new FakeAdapter({ id: "a" });
    manager.registerAdapter(adapter);
    await core.registerModule(manager);

    expect(scheduler.statistics().scheduledCount).toBe(1);
    await core.unregisterModule("adapter-manager");

    expect(scheduler.statistics().scheduledCount).toBe(0);
    expect(adapter.disposeCount).toBe(1);

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new AdapterManager();

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "adapter-manager", status: "OK" }),
    ]);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });
});
