import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ClientManager } from "@dwm/client-manager";
import type { Project, ProjectManager } from "@dwm/project";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read"] as const };

describe("ClientController — clients.documents (Item 4)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-client-documents-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function makeFakeProject(id: string, name: string, projectPath: string): Project {
    return {
      id,
      metadata: { id, name, description: "", createdAt: "", updatedAt: "" },
      configuration: { projectPath, profileId: "p", usedTools: [], usedAdapters: [] },
      state: "created",
    } as unknown as Project;
  }

  it("agrega el índice real de documentos de varios proyectos de un mismo cliente", async () => {
    const projectAPath = tempDir();
    const projectBPath = tempDir();
    await fs.writeFile(path.join(projectAPath, "briefing-inicial.md"), "a");
    await fs.writeFile(path.join(projectBPath, "informe-final.md"), "b");

    const clientManager = {
      getClient: vi.fn().mockResolvedValue({
        id: "mci-finance",
        references: { projects: ["pa", "pb"] },
      }),
    } as unknown as ClientManager;
    const projectManager = {
      getProject: vi.fn((id: string) =>
        id === "pa"
          ? makeFakeProject("pa", "Proyecto A", projectAPath)
          : id === "pb"
            ? makeFakeProject("pb", "Proyecto B", projectBPath)
            : undefined
      ),
    } as unknown as ProjectManager;

    const api = new ApplicationAPI({ clientManager, projectManager });
    const response = await api.execute(
      makeRequest("clients.documents", { id: "mci-finance" }, { caller: admin })
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const docs = response.data as Array<{ name: string; projectId: string }>;
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.name === "briefing-inicial.md")?.projectId).toBe("pa");
    expect(docs.find((d) => d.name === "informe-final.md")?.projectId).toBe("pb");
  });

  it("un proyecto sin id resoluble (eliminado del registro) se omite sin fallar la petición completa", async () => {
    const projectAPath = tempDir();
    await fs.writeFile(path.join(projectAPath, "briefing-inicial.md"), "a");

    const clientManager = {
      getClient: vi.fn().mockResolvedValue({
        id: "mci-finance",
        references: { projects: ["pa", "proyecto-borrado"] },
      }),
    } as unknown as ClientManager;
    const projectManager = {
      getProject: vi.fn((id: string) =>
        id === "pa" ? makeFakeProject("pa", "Proyecto A", projectAPath) : undefined
      ),
    } as unknown as ProjectManager;

    const api = new ApplicationAPI({ clientManager, projectManager });
    const response = await api.execute(
      makeRequest("clients.documents", { id: "mci-finance" }, { caller: admin })
    );

    expect(response.success).toBe(true);
    if (response.success) expect(response.data).toHaveLength(1);
  });

  it("un cliente sin proyectos devuelve una lista vacía real, sin error", async () => {
    const clientManager = {
      getClient: vi.fn().mockResolvedValue({ id: "mci-finance", references: { projects: [] } }),
    } as unknown as ClientManager;
    const projectManager = { getProject: vi.fn() } as unknown as ProjectManager;

    const api = new ApplicationAPI({ clientManager, projectManager });
    const response = await api.execute(
      makeRequest("clients.documents", { id: "mci-finance" }, { caller: admin })
    );

    expect(response.success).toBe(true);
    if (response.success) expect(response.data).toEqual([]);
  });
});
