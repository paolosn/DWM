import { describe, expect, it, vi } from "vitest";
import type { RuleManager } from "@dwm/rule-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "archive", "restore", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listRules: vi.fn().mockResolvedValue([{ id: "r1", archived: false }]),
    getRule: vi.fn().mockResolvedValue({ id: "r1", content: "x", metadata: {} }),
    createRule: vi.fn().mockResolvedValue({ id: "r1", content: "x", metadata: {} }),
    updateRule: vi.fn().mockResolvedValue({ id: "r1", content: "y", metadata: {} }),
    duplicateRule: vi.fn().mockResolvedValue({ id: "r2", content: "x", metadata: {} }),
    archiveRule: vi
      .fn()
      .mockResolvedValue({ id: "r1", content: "x", metadata: { archived: true } }),
    restoreRule: vi
      .fn()
      .mockResolvedValue({ id: "r1", content: "x", metadata: { archived: false } }),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    getRuleFilePath: vi.fn().mockResolvedValue("/workspace/.kilo/rules/r1.md"),
  } as unknown as RuleManager;
  const environmentManager = {
    openInVSCode: vi.fn().mockResolvedValue({ opened: true, message: "VS Code abierto." }),
  } as unknown as import("@dwm/environment-manager").EnvironmentManager;

  return {
    api: new ApplicationAPI({ ruleManager: fakeManager, environmentManager }),
    fakeManager,
    environmentManager,
  };
}

describe("RuleController", () => {
  it("rules.list y rules.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    expect((await api.execute(makeRequest("rules.list", {}, { caller: admin }))).success).toBe(
      true
    );
    await api.execute(makeRequest("rules.get", { id: "r1" }, { caller: admin }));
    expect(fakeManager.getRule).toHaveBeenCalledWith("r1", undefined);
  });

  it("rules.create/update/duplicate/archive/restore delegan correctamente", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("rules.create", { id: "r1", content: "c" }, { caller: admin }));
    expect(fakeManager.createRule).toHaveBeenCalledWith({ id: "r1", content: "c" }, undefined);

    await api.execute(makeRequest("rules.update", { id: "r1", content: "c2" }, { caller: admin }));
    expect(fakeManager.updateRule).toHaveBeenCalledWith("r1", "c2", undefined);

    await api.execute(makeRequest("rules.duplicate", { id: "r1", newId: "r2" }, { caller: admin }));
    expect(fakeManager.duplicateRule).toHaveBeenCalledWith("r1", "r2", undefined);

    await api.execute(makeRequest("rules.archive", { id: "r1" }, { caller: admin }));
    expect(fakeManager.archiveRule).toHaveBeenCalledWith("r1", undefined);

    await api.execute(makeRequest("rules.restore", { id: "r1" }, { caller: admin }));
    expect(fakeManager.restoreRule).toHaveBeenCalledWith("r1", undefined);
  });

  it("rules.delete exige confirmación explícita", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(makeRequest("rules.delete", { id: "r1" }, { caller: admin }));
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "rules.delete",
        { id: "r1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteRule).toHaveBeenCalledWith("r1", undefined);
  });

  it("rules.edit-file resuelve la ruta real (.kilo/rules/<id>.md) y reutiliza EnvironmentManager.openInVSCode()", async () => {
    const { api, fakeManager, environmentManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "rules.edit-file",
        { id: "r1", root: "/workspace/CLIENTES/acme" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.getRuleFilePath).toHaveBeenCalledWith("r1", "/workspace/CLIENTES/acme");
    expect(environmentManager.openInVSCode).toHaveBeenCalledWith("/workspace/.kilo/rules/r1.md");
  });
});
