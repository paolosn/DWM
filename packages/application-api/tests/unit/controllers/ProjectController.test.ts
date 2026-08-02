import { describe, expect, it, vi } from "vitest";
import type { ProjectManager } from "@dwm/project";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "delete"] as const };

function buildApi() {
  const fakeManager = {
    listProjects: vi.fn().mockReturnValue(["p1"]),
    getProject: vi.fn().mockReturnValue({ id: "p1" }),
    createProject: vi.fn().mockResolvedValue({ id: "p1" }),
    updateProject: vi.fn().mockResolvedValue(undefined),
    deleteProject: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectManager;

  return { api: new ApplicationAPI({ projectManager: fakeManager }), fakeManager };
}

const configuration = {
  projectPath: "/workspace/projects/p1",
  profileId: "profile-1",
  usedTools: [],
  usedAdapters: [],
};

describe("ProjectController", () => {
  it("projects.list y projects.get delegan en el manager", async () => {
    const { api, fakeManager } = buildApi();
    const list = await api.execute(makeRequest("projects.list", {}, { caller: admin }));
    expect(list.success).toBe(true);
    expect(fakeManager.listProjects).toHaveBeenCalled();

    await api.execute(makeRequest("projects.get", { id: "p1" }, { caller: admin }));
    expect(fakeManager.getProject).toHaveBeenCalledWith("p1");
  });

  it("projects.create delega en createProject con name/description/configuration", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest(
        "projects.create",
        { name: "Proyecto", description: "desc", configuration },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    expect(fakeManager.createProject).toHaveBeenCalledWith("Proyecto", "desc", configuration);
  });

  it("projects.update delega en updateProject con los campos proporcionados", async () => {
    const { api, fakeManager } = buildApi();
    const response = await api.execute(
      makeRequest("projects.update", { id: "p1", name: "Nuevo nombre" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    expect(fakeManager.updateProject).toHaveBeenCalledWith("p1", { name: "Nuevo nombre" });
  });

  it("projects.delete es destructivo y exige confirmación", async () => {
    const { api, fakeManager } = buildApi();
    const denied = await api.execute(
      makeRequest("projects.delete", { id: "p1" }, { caller: admin })
    );
    expect(denied.success).toBe(false);
    expect(fakeManager.deleteProject).not.toHaveBeenCalled();

    const ok = await api.execute(
      makeRequest(
        "projects.delete",
        { id: "p1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(ok.success).toBe(true);
    expect(fakeManager.deleteProject).toHaveBeenCalledWith("p1");
  });
});
