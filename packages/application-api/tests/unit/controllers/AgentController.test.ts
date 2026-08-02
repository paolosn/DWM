import { describe, expect, it, vi } from "vitest";
import type { AgentManager } from "@dwm/agent-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi(overrides: Partial<AgentManager> = {}) {
  const fakeManager = {
    listAgents: vi.fn().mockResolvedValue([{ id: "a1", archived: false }]),
    getAgent: vi.fn().mockResolvedValue({ id: "a1", data: {}, metadata: {} }),
    createAgent: vi.fn().mockResolvedValue({ id: "a1", data: {}, metadata: {} }),
    updateAgent: vi.fn().mockResolvedValue({ id: "a1", data: {}, metadata: {} }),
    duplicateAgent: vi.fn().mockResolvedValue({ id: "a2", data: {}, metadata: {} }),
    archiveAgent: vi.fn().mockResolvedValue({ id: "a1", data: {}, metadata: { archived: true } }),
    restoreAgent: vi.fn().mockResolvedValue({ id: "a1", data: {}, metadata: { archived: false } }),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AgentManager;

  const api = new ApplicationAPI({ agentManager: fakeManager });
  return { api, fakeManager };
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

  it("agents.create delega en createAgent con id y data", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.create", { id: "a1", data: { name: "x" } }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createAgent).toHaveBeenCalledWith(
      { id: "a1", data: { name: "x" } },
      undefined
    );
  });

  it("agents.update delega en updateAgent", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("agents.update", { id: "a1", data: { name: "y" } }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.updateAgent).toHaveBeenCalledWith("a1", { name: "y" }, undefined);
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
});
