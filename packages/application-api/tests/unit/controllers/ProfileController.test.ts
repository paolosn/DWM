import { describe, expect, it, vi } from "vitest";
import type { ProfileManager } from "@dwm/profile";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "configure"] as const };

function buildApi() {
  const fakeManager = {
    listProfiles: vi.fn().mockReturnValue(["p1"]),
    getProfile: vi.fn().mockReturnValue({ id: "p1" }),
    activateProfile: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProfileManager;

  return { api: new ApplicationAPI({ profileManager: fakeManager }), fakeManager };
}

describe("ProfileController", () => {
  it("profiles.list y profiles.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("profiles.list", {}, { caller: admin }));
    expect(fakeManager.listProfiles).toHaveBeenCalled();

    await api.execute(makeRequest("profiles.get", { id: "p1" }, { caller: admin }));
    expect(fakeManager.getProfile).toHaveBeenCalledWith("p1");
  });

  it("profiles.activate delega en activateProfile", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("profiles.activate", { id: "p1" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.activateProfile).toHaveBeenCalledWith("p1");
  });
});
