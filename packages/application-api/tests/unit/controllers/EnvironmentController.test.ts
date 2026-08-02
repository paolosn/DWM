import { describe, expect, it, vi } from "vitest";
import type { EnvironmentManager } from "@dwm/environment-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const reader = { grantedCapabilities: ["read"] as const };

function buildApi() {
  const fakeManager = {
    inspect: vi.fn().mockResolvedValue({ tools: [] }),
    listTools: vi.fn().mockResolvedValue([]),
    validateRequirements: vi.fn().mockResolvedValue({ valid: true, results: [] }),
  } as unknown as EnvironmentManager;

  return { api: new ApplicationAPI({ environmentManager: fakeManager }), fakeManager };
}

describe("EnvironmentController", () => {
  it("environment.inspect delega y normaliza force ausente", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(makeRequest("environment.inspect", {}, { caller: reader }));
    expect(response.success).toBe(true);
    expect(fakeManager.inspect).toHaveBeenCalledWith({});
  });

  it("environment.inspect propaga force cuando se indica", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("environment.inspect", { force: true }, { caller: reader }));
    expect(fakeManager.inspect).toHaveBeenCalledWith({ force: true });
  });

  it("environment.list-tools delega en listTools", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("environment.list-tools", {}, { caller: reader }));
    expect(fakeManager.listTools).toHaveBeenCalledWith({});
  });

  it("environment.validate exige un array de requirements válido", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "environment.validate",
        { requirements: [{ toolId: "node" }] },
        { caller: reader }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.validateRequirements).toHaveBeenCalledWith([{ toolId: "node" }]);

    const invalid = await api.execute(
      makeRequest("environment.validate", { requirements: "no-array" }, { caller: reader })
    );
    expect(invalid.success).toBe(false);
  });
});
