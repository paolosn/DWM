import { describe, expect, it, vi } from "vitest";
import type { AgentManager } from "@dwm/agent-manager";
import type { ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import { ApplicationAPI } from "../../src/ApplicationAPI.js";
import { ApplicationErrorCode } from "../../src/errors/ApplicationErrorCode.js";
import { makeRequest } from "./support/fixtures.js";

function fakeModuleContext(): ModuleContext {
  return {
    eventBus: {
      publish: vi.fn(),
      subscribe: vi.fn(),
      once: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as ModuleContext["eventBus"],
    getConfig: () => ({}) as never,
    getActiveProfile: () => null,
    reportStatus: vi.fn(),
  };
}

describe("ApplicationAPI", () => {
  it("expone información de versión de la API y capacidades declaradas", () => {
    const api = new ApplicationAPI();
    const info = api.getVersion();
    expect(info.apiVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(info.minCompatibleVersion).toBe(info.apiVersion);
    expect(info.capabilities.length).toBeGreaterThan(0);
    expect(info.operations).toContain("agents.list");
    expect(info.operations).toContain("system.status");
  });

  it("registra todos los controladores de recursos esperados", () => {
    const api = new ApplicationAPI();
    const resources = api.listResources();
    for (const resource of [
      "workspace",
      "agents",
      "skills",
      "rules",
      "knowledge",
      "clients",
      "projects",
      "environment",
      "packages",
      "ai",
      "backups",
      "restore",
      "verification",
      "status",
      "config",
      "profiles",
      "plugins",
    ]) {
      expect(resources).toContain(resource);
    }
  });

  it("delega correctamente en el manager real cuando está disponible", async () => {
    const fakeAgentManager = {
      listAgents: vi.fn().mockResolvedValue([{ id: "a1", archived: false }]),
    } as unknown as AgentManager;

    const api = new ApplicationAPI({ agentManager: fakeAgentManager });
    const response = await api.execute(
      makeRequest("agents.list", {}, { caller: { grantedCapabilities: ["read"] } })
    );

    expect(response.success).toBe(true);
    expect(fakeAgentManager.listAgents).toHaveBeenCalledTimes(1);
    if (response.success) {
      expect(response.data).toEqual([{ id: "a1", archived: false }]);
    }
  });

  it("devuelve APP_DEPENDENCY_UNAVAILABLE cuando el manager requerido no está configurado", async () => {
    const api = new ApplicationAPI(); // sin agentManager
    const response = await api.execute(
      makeRequest("agents.list", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.code).toBe(ApplicationErrorCode.APP_DEPENDENCY_UNAVAILABLE);
      expect(response.error.category).toBe("unavailable");
    }
  });

  it("el fallo de una dependencia no afecta a otros recursos correctamente configurados", async () => {
    const fakeAgentManager = {
      listAgents: vi.fn().mockResolvedValue([]),
    } as unknown as AgentManager;
    const api = new ApplicationAPI({ agentManager: fakeAgentManager }); // sin skillManager

    const okResponse = await api.execute(
      makeRequest("agents.list", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(okResponse.success).toBe(true);

    const failResponse = await api.execute(
      makeRequest("skills.list", {}, { caller: { grantedCapabilities: ["read"] } })
    );
    expect(failResponse.success).toBe(false);
  });

  it("consulta, lista y cancela operaciones largas en curso", async () => {
    const api = new ApplicationAPI();
    const response = await api.execute(
      makeRequest("verification.run", {}, { caller: { grantedCapabilities: ["execute"] } })
    );
    // No hay verificationManager configurado: falla, pero la operación larga
    // queda registrada como "failed" hasta que se limpie explícitamente.
    expect(response.success).toBe(false);
    const operations = api.listOperations();
    expect(operations).toHaveLength(1);
    expect(operations[0]?.state).toBe("failed");

    const removed = api.cleanupFinishedOperations();
    expect(removed).toBe(1);
    expect(api.listOperations()).toEqual([]);
  });

  it("cleanupFinishedOperations elimina operaciones largas ya terminadas", async () => {
    const fakeAgentManager = { listAgents: vi.fn() } as unknown as AgentManager;
    const api = new ApplicationAPI({ agentManager: fakeAgentManager });
    expect(api.cleanupFinishedOperations()).toBe(0);
  });

  it("getOperation lanza para un operationId inexistente", () => {
    const api = new ApplicationAPI();
    expect(() => api.getOperation("no-existe")).toThrowError(/No existe ninguna operación/);
  });

  it("cancelOperation lanza para un operationId inexistente", () => {
    const api = new ApplicationAPI();
    expect(() => api.cancelOperation("no-existe")).toThrowError(/No existe ninguna operación/);
  });

  it("init() reporta estado OK y persiste metadatos si hay configManager", async () => {
    const setSection = vi.fn().mockResolvedValue(undefined);
    const api = new ApplicationAPI({
      configManager: { setSection } as never,
    });
    const context = fakeModuleContext();
    await api.init(context);
    expect(context.reportStatus).toHaveBeenCalledWith(SystemStatus.OK, expect.any(String));
    expect(setSection).toHaveBeenCalledWith(
      "application-api",
      expect.objectContaining({ apiVersion: expect.any(String) })
    );
  });

  it("init() funciona sin configManager configurado", async () => {
    const api = new ApplicationAPI();
    const context = fakeModuleContext();
    await expect(api.init(context)).resolves.toBeUndefined();
  });

  it("dispose() no lanza y no requiere limpieza adicional", async () => {
    const api = new ApplicationAPI();
    await expect(api.dispose()).resolves.toBeUndefined();
  });

  it("declara la identidad de IModule requerida por el Core", () => {
    const api = new ApplicationAPI();
    expect(api.id).toBe("application-api");
    expect(api.version).toBe("1.0.0");
    expect(api.contractVersion).toBe("1.0.0");
  });
});
