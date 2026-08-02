import { describe, expect, it, vi } from "vitest";
import type { BackupManager } from "@dwm/backup";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "export", "delete"] as const };

function buildApi() {
  const fakeManager = {
    createBackup: vi.fn().mockResolvedValue({ id: "b1" }),
    listBackups: vi.fn().mockReturnValue(["b1"]),
    getBackup: vi.fn().mockReturnValue({ id: "b1" }),
    verifyIntegrity: vi.fn().mockResolvedValue({ status: "ok" }),
    deleteBackup: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackupManager;

  return { api: new ApplicationAPI({ backupManager: fakeManager }), fakeManager };
}

const backupRequest = {
  type: "full",
  resources: [{ type: "agents" }],
  target: { kind: "local", path: "/backups" },
};

describe("BackupController", () => {
  it("backups.create es una operación larga que delega en createBackup", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("backups.create", backupRequest, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createBackup).toHaveBeenCalledWith(backupRequest);
  });

  it("rechaza un BackupRequest sin type/resources", async () => {
    const { api } = buildApi();
    const response = await api.execute(makeRequest("backups.create", {}, { caller: admin }));
    expect(response.success).toBe(false);
  });

  it("backups.list/get/verify-integrity delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("backups.list", {}, { caller: admin }));
    expect(fakeManager.listBackups).toHaveBeenCalled();

    await api.execute(makeRequest("backups.get", { id: "b1" }, { caller: admin }));
    expect(fakeManager.getBackup).toHaveBeenCalledWith("b1");

    await api.execute(makeRequest("backups.verify-integrity", { id: "b1" }, { caller: admin }));
    expect(fakeManager.verifyIntegrity).toHaveBeenCalledWith("b1");
  });

  it("backups.delete exige confirmación explícita y admite force", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("backups.delete", { id: "b1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "backups.delete",
        { id: "b1", force: true },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteBackup).toHaveBeenCalledWith("b1", { force: true });
  });

  it("rechaza un valor de force no booleano", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest(
        "backups.delete",
        { id: "b1", force: "sí" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(false);
  });
});
