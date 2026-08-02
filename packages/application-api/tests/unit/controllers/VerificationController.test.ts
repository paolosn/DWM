import { describe, expect, it, vi } from "vitest";
import type { VerificationManager } from "@dwm/verification";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "execute"] as const };

function buildApi() {
  const fakeManager = {
    verify: vi.fn().mockResolvedValue({ summary: {} }),
    listVerifications: vi.fn().mockReturnValue(["v1"]),
    getVerification: vi.fn().mockReturnValue({ id: "v1" }),
  } as unknown as VerificationManager;

  return { api: new ApplicationAPI({ verificationManager: fakeManager }), fakeManager };
}

describe("VerificationController", () => {
  it("verification.run es una operación larga que delega en verify", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("verification.run", { dryRun: true }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.verify).toHaveBeenCalledWith({ dryRun: true });
  });

  it("verification.run normaliza la ausencia de dryRun", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("verification.run", {}, { caller: admin }));
    expect(fakeManager.verify).toHaveBeenCalledWith({});
  });

  it("verification.list y verification.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("verification.list", {}, { caller: admin }));
    expect(fakeManager.listVerifications).toHaveBeenCalled();

    await api.execute(makeRequest("verification.get", { id: "v1" }, { caller: admin }));
    expect(fakeManager.getVerification).toHaveBeenCalledWith("v1");
  });
});
