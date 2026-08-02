import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { ToolingManager } from "../../src/ToolingManager.js";
import { ToolErrorCode } from "../../src/errors/ToolErrorCode.js";
import { defaultToolConfiguration } from "../../src/ToolConfiguration.js";
import type { ToolDescriptor } from "../../src/ToolDescriptor.js";
import { FakeAdapterManager } from "./support/FakeAdapterManager.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "dwm-tooling-manager-"));
}
function cfg(overrides: Partial<ReturnType<typeof defaultToolConfiguration>> = {}) {
  return { ...defaultToolConfiguration(), ...overrides };
}
function descriptor(id: string, overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    id,
    name: id,
    adapterId: id,
    capabilities: { provided: [], required: [] },
    ...overrides,
  };
}

describe("ToolingManager — registro y descubrimiento", () => {
  it("registerTool() registra; discoverTools() encuentra los adaptadores no registrados", () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    adapterManager.addAdapter("vscode");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });

    const discovered = manager.discoverTools();

    expect(discovered.sort()).toEqual(["git", "vscode"]);
    expect(manager.listTools()).toEqual(["git", "vscode"]);
  });

  it("discoverTools() no vuelve a registrar herramientas ya conocidas", () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });

    manager.discoverTools();
    const secondRun = manager.discoverTools();

    expect(secondRun).toEqual([]);
    expect(manager.listTools()).toEqual(["git"]);
  });

  it("registerTool() rechaza configuración inválida", () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    expect(() =>
      manager.registerTool(descriptor("git"), {
        enabled: "si" as never,
        priority: 0,
        dependencies: [],
      })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
  });

  it("unregisterTool() elimina del registro; lanza si no existe", async () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    manager.registerTool(descriptor("git"));
    await manager.unregisterTool("git");
    expect(manager.listTools()).toEqual([]);
    await expect(manager.unregisterTool("git")).rejects.toMatchObject({
      code: ToolErrorCode.TOOL_NOT_FOUND,
    });
  });
});

describe("ToolingManager — ciclo de vida", () => {
  it("initializeTool() delega en AdapterManager y transiciona a 'initialized'", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));

    await manager.initializeTool("git");

    expect(adapterManager.calls).toContain("init:git");
    expect(manager.getState("git")).toBe("initialized");
  });

  it("initializeTool() transiciona a 'error' y envuelve el fallo si el adaptador falla", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git", { failInit: true });
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));

    await expect(manager.initializeTool("git")).rejects.toMatchObject({
      code: ToolErrorCode.TOOL_INIT_FAILED,
    });
    expect(manager.getState("git")).toBe("error");
  });

  it("initializeAll() respeta el orden por dependencias y prioridad", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("provider");
    adapterManager.addAdapter("consumer");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("consumer"), cfg({ dependencies: ["provider"] }));
    manager.registerTool(descriptor("provider"));

    await manager.initializeAll();

    expect(adapterManager.calls).toEqual(["init:provider", "init:consumer"]);
  });

  it("activateTool()/deactivateTool() delegan en AdapterManager y transicionan el estado", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");

    await manager.activateTool("git");
    expect(manager.getState("git")).toBe("active");

    await manager.deactivateTool("git");
    expect(manager.getState("git")).toBe("inactive");
  });

  it("activateTool()/deactivateTool() transicionan a 'error' y envuelven el fallo", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git", { failActivate: true });
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");

    await expect(manager.activateTool("git")).rejects.toMatchObject({
      code: ToolErrorCode.TOOL_ACTIVATE_FAILED,
    });
    expect(manager.getState("git")).toBe("error");
  });

  it("reloadTool() desde 'active' vuelve a dejarla activa, delegando reload en AdapterManager", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");
    await manager.activateTool("git");

    await manager.reloadTool("git");

    expect(adapterManager.calls).toContain("reload:git");
    expect(manager.getState("git")).toBe("active");
  });

  it("reloadTool() desde 'inactive' no reactiva", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");
    await manager.activateTool("git");
    await manager.deactivateTool("git");

    await manager.reloadTool("git");

    expect(manager.getState("git")).toBe("initialized");
  });

  it("removeTool() desactiva si procede y elimina del registro", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");
    await manager.activateTool("git");

    await manager.removeTool("git");

    expect(adapterManager.calls).toContain("deactivate:git");
    expect(manager.listTools()).toEqual([]);
  });
});

describe("ToolingManager — conflictos y compatibilidad", () => {
  it("activateTool() con exclusiveGroup desactiva la herramienta previamente activa del mismo grupo", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("vscode");
    adapterManager.addAdapter("cursor");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("vscode"), cfg({ exclusiveGroup: "editor" }));
    manager.registerTool(descriptor("cursor"), cfg({ exclusiveGroup: "editor" }));
    await manager.initializeTool("vscode");
    await manager.initializeTool("cursor");
    await manager.activateTool("vscode");

    await manager.activateTool("cursor");

    expect(manager.getState("vscode")).toBe("inactive");
    expect(manager.getState("cursor")).toBe("active");
    expect(manager.getActiveTool("editor")).toBe("cursor");
  });

  it("validateCompatibility() no lanza si no hay capacidades requeridas", () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    manager.registerTool(descriptor("git"));
    expect(() => manager.validateCompatibility("git")).not.toThrow();
  });

  it("validateCompatibility() lanza TOOL_INCOMPATIBLE si nadie provee la capacidad requerida", () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    manager.registerTool(
      descriptor("consumer", {
        capabilities: { provided: [], required: [{ name: "cap.x", version: "1.0.0" }] },
      })
    );
    expect(() => manager.validateCompatibility("consumer")).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_INCOMPATIBLE })
    );
  });

  it("validateCompatibility() no lanza si otra herramienta provee la capacidad requerida", () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    manager.registerTool(
      descriptor("provider", {
        capabilities: { provided: [{ name: "cap.x", version: "1.0.0" }], required: [] },
      })
    );
    manager.registerTool(
      descriptor("consumer", {
        capabilities: { provided: [], required: [{ name: "cap.x", version: "1.0.0" }] },
      })
    );
    expect(() => manager.validateCompatibility("consumer")).not.toThrow();
  });

  it("activateTool() rechaza activar una herramienta incompatible", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("consumer");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(
      descriptor("consumer", {
        capabilities: { provided: [], required: [{ name: "cap.x", version: "1.0.0" }] },
      })
    );
    await manager.initializeTool("consumer");

    await expect(manager.activateTool("consumer")).rejects.toMatchObject({
      code: ToolErrorCode.TOOL_INCOMPATIBLE,
    });
  });
});

describe("ToolingManager — estado, capacidades, salud e introspección", () => {
  it("getCapabilities()/getTool() reflejan lo registrado", () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    const capabilities = { provided: [{ name: "cap.a", version: "1.0.0" }], required: [] };
    manager.registerTool(descriptor("git", { capabilities }));

    expect(manager.getCapabilities("git")).toEqual(capabilities);
    expect(manager.getTool("git")).toMatchObject({ state: "registered" });
    expect(manager.getTool("no-existe")).toBeUndefined();
  });

  it("checkHealth() traduce la salud del adaptador subyacente; checkAllHealth() cubre todas", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("a", { healthy: true });
    adapterManager.addAdapter("b", { healthy: false });
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("a"));
    manager.registerTool(descriptor("b"));

    const results = await manager.checkAllHealth();

    expect(results.map((h) => h.healthy)).toEqual([true, false]);
    expect(manager.getHealth("a")?.healthy).toBe(true);
  });

  it("checkHealth() envuelve un fallo del propio checkHealth() del adaptador", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("a", { failHealthCheck: true });
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("a"));

    const health = await manager.checkHealth("a");

    expect(health.healthy).toBe(false);
    expect(health.detail).toBeDefined();
  });

  it("setActiveTool()/listActiveTools() gestionan la activación", async () => {
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never });
    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");

    await manager.setActiveTool("git");

    expect(manager.listActiveTools()).toEqual(["git"]);
  });
});

describe("ToolingManager — eventos, logging e integraciones opcionales", () => {
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
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({
      adapterManager: adapterManager as never,
      eventBus: fakeBus as never,
    });

    manager.registerTool(descriptor("git"));
    await manager.initializeTool("git");
    await manager.activateTool("git");
    await manager.deactivateTool("git");
    await manager.checkHealth("git");
    await manager.unregisterTool("git");

    expect(published).toEqual([
      "tooling.registered",
      "tooling.initialized",
      "tooling.activated",
      "tooling.deactivated",
      "tooling.health.ok",
      "tooling.unregistered",
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
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({
      adapterManager: adapterManager as never,
      logger: fakeLogger as never,
    });
    manager.registerTool(descriptor("git"));

    await manager.initializeTool("git");

    expect(logs.some((m) => m.includes("tooling:initialized"))).toBe(true);
  });

  it("registra un health check fallido como error a través del Logger inyectado", async () => {
    const logs: Array<{ level: string; message: string }> = [];
    const fakeLogger = {
      withCorrelationId: () => ({
        info: async (m: string) => void logs.push({ level: "info", message: m }),
        error: async (m: string) => void logs.push({ level: "error", message: m }),
      }),
    };
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git", { healthy: false });
    const manager = new ToolingManager({
      adapterManager: adapterManager as never,
      logger: fakeLogger as never,
    });
    manager.registerTool(descriptor("git"));

    await manager.checkHealth("git");

    expect(
      logs.some((l) => l.level === "error" && l.message.includes("tooling:health.error"))
    ).toBe(true);
  });

  it("getToolContext() expone getSecret(), aiManager y activeWorkspaceId cuando están inyectados", async () => {
    const secretsManager = { getSecret: async (key: string) => `valor-de-${key}` };
    const fakeAiManager = { marker: "ai-de-pruebas" };
    const fakeWorkspaceManager = { getActiveWorkspace: () => ({ id: "workspace-1" }) };
    const manager = new ToolingManager({
      adapterManager: new FakeAdapterManager() as never,
      secretsManager: secretsManager as never,
      aiManager: fakeAiManager as never,
      workspaceManager: fakeWorkspaceManager as never,
    });
    manager.registerTool(descriptor("git"));

    const context = manager.getToolContext("git");

    expect(context.aiManager).toBe(fakeAiManager);
    expect(context.activeWorkspaceId).toBe("workspace-1");
    await expect(context.getSecret("k")).resolves.toBe("valor-de-k");
  });

  it("getToolContext() devuelve getSecret() → undefined sin SecretsManager", async () => {
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });
    manager.registerTool(descriptor("git"));
    const context = manager.getToolContext("git");
    await expect(context.getSecret("k")).resolves.toBeUndefined();
  });
});

describe("ToolingManager — integración con Config, Scheduler y Core", () => {
  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({ adapterManager: adapterManager as never, configManager });
    manager.registerTool(descriptor("git"));

    await core.registerModule(manager);

    expect(await configManager.getSection("tooling-manager")).toEqual({ tools: ["git"] });

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("getConfigSection() en el contexto usa el ConfigManager inyectado", async () => {
    const configManager = new ConfigManager({ configDir: tempDir() });
    await configManager.setSection("tool.git", { activado: true });
    const manager = new ToolingManager({
      adapterManager: new FakeAdapterManager() as never,
      configManager,
    });
    manager.registerTool(descriptor("git"));

    const context = manager.getToolContext("git");
    await expect(context.getConfigSection("tool.git")).resolves.toEqual({ activado: true });
  });

  it("programa el health check periódico a través de un Scheduler inyectado", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({
      adapterManager: adapterManager as never,
      scheduler,
      healthCheckIntervalMs: 1000,
    });
    manager.registerTool(descriptor("git"));

    vi.useFakeTimers();
    try {
      await core.registerModule(manager);
      await vi.advanceTimersByTimeAsync(1000);
    } finally {
      vi.useRealTimers();
    }

    expect(manager.getHealth("git")).toBeDefined();

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("dispose() cancela la tarea de health check sin tocar el ciclo de vida de los adaptadores", async () => {
    const scheduler = new Scheduler();
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const adapterManager = new FakeAdapterManager();
    adapterManager.addAdapter("git");
    const manager = new ToolingManager({
      adapterManager: adapterManager as never,
      scheduler,
      healthCheckIntervalMs: 1000,
    });
    manager.registerTool(descriptor("git"));
    await core.registerModule(manager);

    expect(scheduler.statistics().scheduledCount).toBe(1);
    await core.unregisterModule("tooling-manager");

    expect(scheduler.statistics().scheduledCount).toBe(0);
    expect(adapterManager.calls.some((c) => c.startsWith("deactivate:"))).toBe(false);

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = tempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new ToolingManager({ adapterManager: new FakeAdapterManager() as never });

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "tooling-manager", status: "OK" }),
    ]);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });
});
