import { describe, expect, it, vi } from "vitest";
import type { AgentManager } from "@dwm/agent-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi(overrides: Partial<AgentManager> = {}) {
  const environmentManager = {
    openInVSCode: vi.fn().mockResolvedValue({ opened: true, message: "VS Code abierto." }),
  } as unknown as import("@dwm/environment-manager").EnvironmentManager;
  const fakeManager = {
    listAgents: vi.fn().mockResolvedValue([{ id: "a1", archived: false }]),
    getAgent: vi.fn().mockResolvedValue({ id: "a1", content: "# a1\n", metadata: {} }),
    createAgent: vi.fn().mockResolvedValue({ id: "a1", content: "# a1\n", metadata: {} }),
    updateAgent: vi.fn().mockResolvedValue({ id: "a1", content: "# a1\n", metadata: {} }),
    duplicateAgent: vi.fn().mockResolvedValue({ id: "a2", content: "# a1\n", metadata: {} }),
    archiveAgent: vi
      .fn()
      .mockResolvedValue({ id: "a1", content: "# a1\n", metadata: { archived: true } }),
    restoreAgent: vi
      .fn()
      .mockResolvedValue({ id: "a1", content: "# a1\n", metadata: { archived: false } }),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
    getAgentFilePath: vi.fn().mockResolvedValue("/workspace/.kilo/agents/a1.md"),
    ...overrides,
  } as unknown as AgentManager;

  const api = new ApplicationAPI({ agentManager: fakeManager, environmentManager });
  return { api, fakeManager, environmentManager };
}

describe("AgentController", () => {
  it("agents.list delega en listAgents con opciones normalizadas", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.list", { includeArchived: true }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.listAgents).toHaveBeenCalledWith({ includeArchived: true });
  });

  it("agents.get exige id y delega en getAgent", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(makeRequest("agents.get", { id: "a1" }, { caller: admin }));
    expect(response.success).toBe(true);
    expect(fakeManager.getAgent).toHaveBeenCalledWith("a1", undefined);

    const invalid = await api.execute(makeRequest("agents.get", {}, { caller: admin }));
    expect(invalid.success).toBe(false);
  });

  it("agents.create delega en createAgent con id y content", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.create", { id: "a1", content: "# x\n" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createAgent).toHaveBeenCalledWith({ id: "a1", content: "# x\n" }, undefined);
  });

  it("agents.update delega en updateAgent", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.update", { id: "a1", content: "# y\n" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.updateAgent).toHaveBeenCalledWith("a1", "# y\n", undefined);
  });

  it("agents.duplicate delega en duplicateAgent", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.duplicate", { id: "a1", newId: "a2" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.duplicateAgent).toHaveBeenCalledWith("a1", "a2", undefined);
  });

  it("agents.archive y agents.restore delegan correctamente", async () => {
    const { api, fakeManager } = buildApi();
    const archived = await api.execute(
      makeRequest("agents.archive", { id: "a1" }, { caller: admin })
    );
    expect(archived.success).toBe(true);
    expect(fakeManager.archiveAgent).toHaveBeenCalledWith("a1", undefined);

    const restored = await api.execute(
      makeRequest("agents.restore", { id: "a1" }, { caller: admin })
    );
    expect(restored.success).toBe(true);
    expect(fakeManager.restoreAgent).toHaveBeenCalledWith("a1", undefined);
  });

  it("agents.delete es destructivo y exige confirmación explícita", async () => {
    const { api, fakeManager } = buildApi();
    const withoutConfirmation = await api.execute(
      makeRequest("agents.delete", { id: "a1" }, { caller: admin })
    );
    expect(withoutConfirmation.success).toBe(false);
    expect(fakeManager.deleteAgent).not.toHaveBeenCalled();

    const withConfirmation = await api.execute(
      makeRequest(
        "agents.delete",
        { id: "a1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(withConfirmation.success).toBe(true);
    expect(fakeManager.deleteAgent).toHaveBeenCalledWith("a1", undefined);
  });

  it("rechaza path traversal en el campo root", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("agents.get", { id: "a1", root: "../../etc" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });

  it("agents.get-file-path delega en getAgentFilePath y devuelve la ruta real resuelta por el backend", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.get-file-path", { id: "a1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (response.success) expect(response.data.path).toBe("/workspace/.kilo/agents/a1.md");
    expect(fakeManager.getAgentFilePath).toHaveBeenCalledWith("a1", undefined);
  });

  it("agents.edit-file resuelve la ruta real y reutiliza EnvironmentManager.openInVSCode() tal cual, en cualquier alcance (root)", async () => {
    const { api, fakeManager, environmentManager } = buildApi();

    const global = await api.execute(
      makeRequest("agents.edit-file", { id: "a1" }, { caller: admin })
    );
    expect(global.success).toBe(true);
    if (global.success) expect(global.data.opened).toBe(true);

    const scoped = await api.execute(
      makeRequest(
        "agents.edit-file",
        { id: "a1", root: "/workspace/CLIENTES/acme" },
        { caller: admin }
      )
    );
    expect(scoped.success).toBe(true);
    expect(fakeManager.getAgentFilePath).toHaveBeenCalledWith("a1", "/workspace/CLIENTES/acme");
    expect(environmentManager.openInVSCode).toHaveBeenCalledWith("/workspace/.kilo/agents/a1.md");
  });

  it("agents.edit-file con un agente inexistente devuelve un error real (nunca simulado)", async () => {
    const { api } = buildApi({
      getAgentFilePath: vi
        .fn()
        .mockRejectedValue(new Error('No existe ningún agente con id "no-existe".')),
    });
    const response = await api.execute(
      makeRequest("agents.edit-file", { id: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });

  it("agents.edit-file rechaza path traversal real en el campo root, igual que el resto de operaciones", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("agents.edit-file", { id: "a1", root: "../../etc" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });
});
