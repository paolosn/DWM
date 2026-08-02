import { describe, expect, it, vi } from "vitest";
import type { PluginManager } from "@dwm/plugin";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "configure"] as const };

function buildApi() {
  const fakeManager = {
    listPlugins: vi.fn().mockReturnValue(["pl1"]),
    getPlugin: vi.fn().mockReturnValue({ id: "pl1" }),
    checkHealth: vi.fn().mockResolvedValue({ status: "healthy" }),
    deactivatePlugin: vi.fn().mockResolvedValue(undefined),
  } as unknown as PluginManager;

  return { api: new ApplicationAPI({ pluginManager: fakeManager }), fakeManager };
}

describe("PluginController", () => {
  it("plugins.list, plugins.get y plugins.check-health delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("plugins.list", {}, { caller: admin }));
    expect(fakeManager.listPlugins).toHaveBeenCalled();

    await api.execute(makeRequest("plugins.get", { id: "pl1" }, { caller: admin }));
    expect(fakeManager.getPlugin).toHaveBeenCalledWith("pl1");

    await api.execute(makeRequest("plugins.check-health", { id: "pl1" }, { caller: admin }));
    expect(fakeManager.checkHealth).toHaveBeenCalledWith("pl1");
  });

  it("plugins.deactivate es destructivo y exige confirmación", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("plugins.deactivate", { id: "pl1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "plugins.deactivate",
        { id: "pl1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deactivatePlugin).toHaveBeenCalledWith("pl1");
  });
});
