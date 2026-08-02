import { describe, expect, it, vi } from "vitest";
import type { SkillManager } from "@dwm/skill-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listSkills: vi.fn().mockResolvedValue([{ id: "s1", archived: false }]),
    getSkill: vi.fn().mockResolvedValue({ id: "s1", content: "x", metadata: {} }),
    createSkill: vi.fn().mockResolvedValue({ id: "s1", content: "x", metadata: {} }),
    updateSkill: vi.fn().mockResolvedValue({ id: "s1", content: "y", metadata: {} }),
    duplicateSkill: vi.fn().mockResolvedValue({ id: "s2", content: "x", metadata: {} }),
    archiveSkill: vi
      .fn()
      .mockResolvedValue({ id: "s1", content: "x", metadata: { archived: true } }),
    restoreSkill: vi
      .fn()
      .mockResolvedValue({ id: "s1", content: "x", metadata: { archived: false } }),
    deleteSkill: vi.fn().mockResolvedValue(undefined),
  } as unknown as SkillManager;

  return { api: new ApplicationAPI({ skillManager: fakeManager }), fakeManager };
}

describe("SkillController", () => {
  it("skills.list y skills.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    expect((await api.execute(makeRequest("skills.list", {}, { caller: admin }))).success).toBe(
      true
    );
    expect(
      (await api.execute(makeRequest("skills.get", { id: "s1" }, { caller: admin }))).success
    ).toBe(true);
    expect(fakeManager.getSkill).toHaveBeenCalledWith("s1", undefined);
  });

  it("skills.create delega en createSkill con id/content", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("skills.create", { id: "s1", content: "# hola" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createSkill).toHaveBeenCalledWith(
      { id: "s1", content: "# hola" },
      undefined
    );
  });

  it("skills.update delega en updateSkill", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest("skills.update", { id: "s1", content: "nuevo" }, { caller: admin })
    );
    expect(fakeManager.updateSkill).toHaveBeenCalledWith("s1", "nuevo", undefined);
  });

  it("skills.duplicate, archive y restore delegan correctamente", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(
      makeRequest("skills.duplicate", { id: "s1", newId: "s2" }, { caller: admin })
    );
    expect(fakeManager.duplicateSkill).toHaveBeenCalledWith("s1", "s2", undefined);

    await api.execute(makeRequest("skills.archive", { id: "s1" }, { caller: admin }));
    expect(fakeManager.archiveSkill).toHaveBeenCalledWith("s1", undefined);

    await api.execute(makeRequest("skills.restore", { id: "s1" }, { caller: admin }));
    expect(fakeManager.restoreSkill).toHaveBeenCalledWith("s1", undefined);
  });

  it("skills.delete exige confirmación y traduce confirmPermanent al dominio", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(makeRequest("skills.delete", { id: "s1" }, { caller: admin }));
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "skills.delete",
        { id: "s1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteSkill).toHaveBeenCalledWith(
      "s1",
      { confirmPermanent: true },
      undefined
    );
  });
});
