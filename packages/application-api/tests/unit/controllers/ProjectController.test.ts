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

  it("projects.open-in-vscode reutiliza environmentManager.openInVSCode con la ruta real del proyecto", async () => {
    const fakeManager = {
      getProject: vi.fn().mockReturnValue({
        id: "p1",
        configuration: { projectPath: "/workspace/projects/portal-clientes" },
      }),
    } as unknown as ProjectManager;
    const openInVSCode = vi.fn().mockResolvedValue({
      opened: true,
      message: 'VS Code abierto en "/workspace/projects/portal-clientes".',
    });
    const fakeEnvironmentManager = {
      openInVSCode,
    } as unknown as import("@dwm/environment-manager").EnvironmentManager;

    const api = new ApplicationAPI({
      projectManager: fakeManager,
      environmentManager: fakeEnvironmentManager,
    });
    const response = await api.execute(
      makeRequest("projects.open-in-vscode", { id: "p1" }, { caller: admin })
    );

    expect(response.success).toBe(true);
    expect(openInVSCode).toHaveBeenCalledWith("/workspace/projects/portal-clientes");
    if (response.success) {
      expect((response.data as { opened: boolean }).opened).toBe(true);
    }
  });

  it("projects.open-in-vscode falla con un mensaje claro si el proyecto no existe", async () => {
    const fakeManager = {
      getProject: vi.fn().mockReturnValue(undefined),
    } as unknown as ProjectManager;
    const fakeEnvironmentManager = {
      openInVSCode: vi.fn(),
    } as unknown as import("@dwm/environment-manager").EnvironmentManager;
    const api = new ApplicationAPI({
      projectManager: fakeManager,
      environmentManager: fakeEnvironmentManager,
    });

    const response = await api.execute(
      makeRequest("projects.open-in-vscode", { id: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(false);
    expect(response.success || response.error.category).toBe("not-found");
  });

  it("projects.archive reutiliza ProjectManager.closeProject() y devuelve el proyecto ya cerrado", async () => {
    const closedProject = { id: "p1", state: "closed" };
    const fakeManager = {
      closeProject: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockReturnValue(closedProject),
    } as unknown as ProjectManager;
    const api = new ApplicationAPI({ projectManager: fakeManager });

    const response = await api.execute(
      makeRequest(
        "projects.archive",
        { id: "p1" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );

    expect(response.success).toBe(true);
    expect(fakeManager.closeProject).toHaveBeenCalledWith("p1");
    if (response.success) {
      expect((response.data as { state: string }).state).toBe("closed");
    }
  });

  it("projects.archive exige confirmación (operación destructiva)", async () => {
    const fakeManager = {
      closeProject: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockReturnValue({ id: "p1", state: "closed" }),
    } as unknown as ProjectManager;
    const api = new ApplicationAPI({ projectManager: fakeManager });

    const response = await api.execute(
      makeRequest("projects.archive", { id: "p1" }, { caller: admin })
    );

    expect(response.success).toBe(false);
    expect(fakeManager.closeProject).not.toHaveBeenCalled();
  });

  it("projects.archive falla con un mensaje claro si el proyecto no existe tras cerrarlo", async () => {
    const fakeManager = {
      closeProject: vi.fn().mockResolvedValue(undefined),
      getProject: vi.fn().mockReturnValue(undefined),
    } as unknown as ProjectManager;
    const api = new ApplicationAPI({ projectManager: fakeManager });

    const response = await api.execute(
      makeRequest(
        "projects.archive",
        { id: "no-existe" },
        { caller: admin, confirmation: { confirmed: true } }
      )
    );
    expect(response.success).toBe(false);
  });
});
