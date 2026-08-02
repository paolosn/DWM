import { describe, expect, it, vi } from "vitest";
import type { StatusManager } from "@dwm/status";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const reader = { grantedCapabilities: ["read"] as const };

function buildApi() {
  const fakeManager = {
    getGlobalStatus: vi.fn().mockResolvedValue({ level: "OK", modules: [] }),
    getModuleStatus: vi.fn().mockResolvedValue({ id: "core", level: "OK" }),
  } as unknown as StatusManager;

  return { api: new ApplicationAPI({ statusManager: fakeManager }), fakeManager };
}

describe("StatusController", () => {
  it("system.status delega en getGlobalStatus", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(makeRequest("system.status", {}, { caller: reader }));
    expect(response.success).toBe(true);
    expect(fakeManager.getGlobalStatus).toHaveBeenCalled();
  });

  it("status.module exige id y delega en getModuleStatus", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("status.module", { id: "core" }, { caller: reader })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.getModuleStatus).toHaveBeenCalledWith("core");

    const invalid = await api.execute(makeRequest("status.module", {}, { caller: reader }));
    expect(invalid.success).toBe(false);
  });
});
