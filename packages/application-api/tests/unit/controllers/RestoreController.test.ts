import { describe, expect, it, vi } from "vitest";
import type { RestoreManager } from "@dwm/restore";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "restore"] as const };

function buildApi() {
  const fakeManager = {
    restoreBackup: vi.fn().mockResolvedValue({ restored: true }),
    listRestores: vi.fn().mockReturnValue(["r1"]),
    getRestore: vi.fn().mockReturnValue({ id: "r1" }),
  } as unknown as RestoreManager;

  return { api: new ApplicationAPI({ restoreManager: fakeManager }), fakeManager };
}

describe("RestoreController", () => {
  it("restore.execute es destructivo, larga y exige confirmación", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("restore.execute", { backupId: "b1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const response = await api.execute(
      makeRequest(
        "restore.execute",
        { backupId: "b1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.restoreBackup).toHaveBeenCalledWith({ backupId: "b1" });
  });

  it("rechaza un RestoreRequest sin backupId", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("restore.execute", {}, { caller: admin, confirmation: { confirmed: true } })
    );
    expect(response.success).toBe(false);
  });

  it("restore.list y restore.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("restore.list", {}, { caller: admin }));
    expect(fakeManager.listRestores).toHaveBeenCalled();

    await api.execute(makeRequest("restore.get", { id: "r1" }, { caller: admin }));
    expect(fakeManager.getRestore).toHaveBeenCalledWith("r1");
  });
});
