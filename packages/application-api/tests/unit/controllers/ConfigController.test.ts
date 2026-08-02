import { describe, expect, it, vi } from "vitest";
import type { ConfigManager } from "@dwm/config";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "configure", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listNamespaces: vi.fn().mockResolvedValue(["ns1"]),
    getSection: vi.fn().mockResolvedValue({ a: 1 }),
    setSection: vi.fn().mockResolvedValue(undefined),
    deleteSection: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfigManager;

  return { api: new ApplicationAPI({ configManager: fakeManager }), fakeManager };
}

describe("ConfigController", () => {
  it("config.list y config.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("config.list", {}, { caller: admin }));
    expect(fakeManager.listNamespaces).toHaveBeenCalled();

    await api.execute(makeRequest("config.get", { namespace: "ns1" }, { caller: admin }));
    expect(fakeManager.getSection).toHaveBeenCalledWith("ns1");
  });

  it("config.set es destructivo, exige confirmación y delega en setSection", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("config.set", { namespace: "ns1", value: { a: 2 } }, { caller: admin })
    );
    expect(denied.success).toBe(false);

    const ok = await api.execute(
      makeRequest(
        "config.set",
        { namespace: "ns1", value: { a: 2 } },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.setSection).toHaveBeenCalledWith("ns1", { a: 2 });
  });

  it("config.set rechaza escribir en el namespace reservado del propio módulo", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "config.set",
        { namespace: "application-api", value: {} },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(false);
    expect(fakeManager.setSection).not.toHaveBeenCalled();
  });

  it("config.delete exige confirmación y delega en deleteSection", async () => {
    const { api, fakeManager } = buildApi();
    const ok = await api.execute(
      makeRequest(
        "config.delete",
        { namespace: "ns1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteSection).toHaveBeenCalledWith("ns1");
  });
});
