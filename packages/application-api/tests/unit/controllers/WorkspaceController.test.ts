import { describe, expect, it, vi } from "vitest";
import type { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const reader = { grantedCapabilities: ["read"] as const };
const writer = { grantedCapabilities: ["read", "write"] as const };

function buildApi() {
  const fakeManager = {
    getActiveWorkspace: vi.fn().mockReturnValue({ root: "/ws", metadata: {}, registeredAt: "" }),
    validateWorkspace: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
    initializeWorkspace: vi.fn().mockResolvedValue({
      paths: {},
      metadata: { id: "ws1" },
      alreadyInitialized: false,
      createdDirectories: ["/ws/.dwm"],
    }),
    registerActiveWorkspace: vi
      .fn()
      .mockResolvedValue({ root: "/ws", metadata: {}, registeredAt: "" }),
  } as unknown as PortableWorkspaceManager;

  return { api: new ApplicationAPI({ portableWorkspaceManager: fakeManager }), fakeManager };
}

describe("WorkspaceController", () => {
  it("workspace.get delega en getActiveWorkspace", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(makeRequest("workspace.get", {}, { caller: reader }));
    expect(response.success).toBe(true);
    expect(fakeManager.getActiveWorkspace).toHaveBeenCalled();
  });

  it("workspace.validate exige root y delega en validateWorkspace", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("workspace.validate", { root: "/ws" }, { caller: reader })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.validateWorkspace).toHaveBeenCalledWith("/ws");

    const invalid = await api.execute(makeRequest("workspace.validate", {}, { caller: reader }));
    expect(invalid.success).toBe(false);
  });

  it("rechaza path traversal en workspace.validate", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("workspace.validate", { root: "../evil" }, { caller: reader })
    );
    expect(response.success).toBe(false);
  });

  it("workspace.initialize delega en initializeWorkspace, root es opcional", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("workspace.initialize", { root: "/ws" }, { caller: writer })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.initializeWorkspace).toHaveBeenCalledWith("/ws");

    const withoutRoot = await api.execute(
      makeRequest("workspace.initialize", {}, { caller: writer })
    );
    expect(withoutRoot.success).toBe(true);
    expect(fakeManager.initializeWorkspace).toHaveBeenCalledWith(undefined);
  });

  it("rechaza path traversal en workspace.initialize", async () => {
    const { api } = buildApi();
    const response = await api.execute(
      makeRequest("workspace.initialize", { root: "../evil" }, { caller: writer })
    );
    expect(response.success).toBe(false);
  });

  it("workspace.register exige root y delega en registerActiveWorkspace", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("workspace.register", { root: "/ws" }, { caller: writer })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.registerActiveWorkspace).toHaveBeenCalledWith("/ws");

    const invalid = await api.execute(makeRequest("workspace.register", {}, { caller: writer }));
    expect(invalid.success).toBe(false);
  });
});
