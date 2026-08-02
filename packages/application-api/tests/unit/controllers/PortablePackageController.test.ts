import { describe, expect, it, vi } from "vitest";
import type { PortablePackageManager } from "@dwm/portable-package-manager";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "export"] as const };

function buildApi() {
  const fakeManager = {
    createPackage: vi.fn().mockResolvedValue({ manifest: {}, zipPath: "/x.zip", warnings: [] }),
    inspectManifest: vi.fn().mockResolvedValue({ entries: [] }),
    listPackageContents: vi.fn().mockResolvedValue([]),
    validatePackage: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
  } as unknown as PortablePackageManager;

  return { api: new ApplicationAPI({ portablePackageManager: fakeManager }), fakeManager };
}

describe("PortablePackageController", () => {
  it("packages.create es una operación larga, destructiva y delega en createPackage", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("packages.create", { destinationZipPath: "/tmp/out.zip" }, { caller: admin })
    );
    expect(denied.success).toBe(false); // sin confirmación

    const response = await api.execute(
      makeRequest(
        "packages.create",
        { destinationZipPath: "/tmp/out.zip" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createPackage).toHaveBeenCalledWith({ destinationZipPath: "/tmp/out.zip" });
    if (response.success) {
      expect(response.metadata?.["operationId"]).toBeDefined();
    }
  });

  it("packages.inspect/list-contents/validate delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    await api.execute(makeRequest("packages.inspect", { zipPath: "/x.zip" }, { caller: admin }));
    expect(fakeManager.inspectManifest).toHaveBeenCalledWith("/x.zip");

    await api.execute(
      makeRequest("packages.list-contents", { zipPath: "/x.zip" }, { caller: admin })
    );
    expect(fakeManager.listPackageContents).toHaveBeenCalledWith("/x.zip");

    await api.execute(makeRequest("packages.validate", { zipPath: "/x.zip" }, { caller: admin }));
    expect(fakeManager.validatePackage).toHaveBeenCalledWith("/x.zip");
  });

  it("rechaza rutas absolutas no autorizadas y path traversal", async () => {
    const { api } = buildApi();
    const traversal = await api.execute(
      makeRequest("packages.inspect", { zipPath: "../../x.zip" }, { caller: admin })
    );
    expect(traversal.success).toBe(false);
  });
});
