import { describe, expect, it, vi } from "vitest";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listKnowledge: vi.fn().mockResolvedValue([{ id: "k1", archived: false }]),
    getKnowledge: vi.fn().mockResolvedValue({ id: "k1", content: "x", metadata: {} }),
    searchKnowledge: vi.fn().mockResolvedValue([{ id: "k1" }]),
    createKnowledge: vi.fn().mockResolvedValue({ id: "k1", content: "x", metadata: {} }),
    updateKnowledge: vi.fn().mockResolvedValue({ id: "k1", content: "y", metadata: {} }),
    archiveKnowledge: vi
      .fn()
      .mockResolvedValue({ id: "k1", content: "x", metadata: { archived: true } }),
    restoreKnowledge: vi
      .fn()
      .mockResolvedValue({ id: "k1", content: "x", metadata: { archived: false } }),
    deleteKnowledge: vi.fn().mockResolvedValue(undefined),
  } as unknown as KnowledgeManager;

  return { api: new ApplicationAPI({ knowledgeManager: fakeManager }), fakeManager };
}

describe("KnowledgeController", () => {
  it("knowledge.list/get/search delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("knowledge.list", {}, { caller: admin }));
    await api.execute(makeRequest("knowledge.get", { id: "k1" }, { caller: admin }));
    await api.execute(makeRequest("knowledge.search", { query: "hola" }, { caller: admin }));
    expect(fakeManager.getKnowledge).toHaveBeenCalledWith("k1", undefined);
    expect(fakeManager.searchKnowledge).toHaveBeenCalledWith("hola", undefined);
  });

  it("knowledge.create incluye tags/category solo si se proporcionan", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest(
        "knowledge.create",
        { id: "k1", content: "c", tags: ["a"], category: "cat" },
        { caller: admin }
      )
    );
    expect(fakeManager.createKnowledge).toHaveBeenCalledWith(
      { id: "k1", content: "c", tags: ["a"], category: "cat" },
      undefined
    );

    await api.execute(
      makeRequest("knowledge.create", { id: "k2", content: "c2" }, { caller: admin })
    );
    expect(fakeManager.createKnowledge).toHaveBeenCalledWith(
      { id: "k2", content: "c2" },
      undefined
    );
  });

  it("knowledge.update/archive/restore delegan correctamente", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest("knowledge.update", { id: "k1", content: "nuevo" }, { caller: admin })
    );
    expect(fakeManager.updateKnowledge).toHaveBeenCalledWith("k1", "nuevo", undefined);

    await api.execute(makeRequest("knowledge.archive", { id: "k1" }, { caller: admin }));
    expect(fakeManager.archiveKnowledge).toHaveBeenCalledWith("k1", undefined);

    await api.execute(makeRequest("knowledge.restore", { id: "k1" }, { caller: admin }));
    expect(fakeManager.restoreKnowledge).toHaveBeenCalledWith("k1", undefined);
  });

  it("knowledge.delete exige confirmación explícita", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("knowledge.delete", { id: "k1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "knowledge.delete",
        { id: "k1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteKnowledge).toHaveBeenCalledWith(
      "k1",
      { confirmPermanent: true },
      undefined
    );
  });
});
