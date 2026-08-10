import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { ProjectManager } from "@dwm/project";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read"] as const };

describe("ContentScopeController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function fakeWorkspaceManager(root: string): PortableWorkspaceManager {
    return {
      getActiveWorkspace: (): WorkspaceRegistryEntry => ({
        root,
        metadata: { id: "ws-1", name: "ws", createdAt: "", updatedAt: "" } as never,
        registeredAt: new Date().toISOString(),
      }),
    } as unknown as PortableWorkspaceManager;
  }

  async function buildApi() {
    const workspaceRoot = tempDir("dwm-content-scope-ctrl-");
    await fs.mkdir(path.join(workspaceRoot, "PSN-BASE", ".kilo", "agents"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "CLIENTES"), { recursive: true });

    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(path.join(workspaceRoot, "PSN-BASE"));
    const projectManager = new ProjectManager({
      projectsDir: tempDir("dwm-content-scope-ctrl-projects-"),
    });

    const api = new ApplicationAPI({
      psnAdapter,
      projectManager,
      portableWorkspaceManager: fakeWorkspaceManager(workspaceRoot),
    });
    return { api, workspaceRoot, projectManager };
  }

  it("sin clientId ni projectId: devuelve la raíz global real dentro de PSN-BASE (no la raíz del Sistema, no <workspace>/.kilo)", async () => {
    const { api, workspaceRoot } = await buildApi();
    const response = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (response.success) {
      expect((response.data as { root: string }).root).toBe(path.join(workspaceRoot, "PSN-BASE"));
    }
  });

  it("si PSN-BASE no existe físicamente, falla con un error real y claro (nunca inventa <workspace>/.kilo)", async () => {
    const workspaceRoot = tempDir("dwm-content-scope-no-psnbase-");
    await fs.mkdir(path.join(workspaceRoot, "CLIENTES"), { recursive: true });
    const psnAdapter = new PSNAdapter();
    const projectManager = new ProjectManager({
      projectsDir: tempDir("dwm-content-scope-projects-"),
    });
    const api = new ApplicationAPI({
      psnAdapter,
      projectManager,
      portableWorkspaceManager: fakeWorkspaceManager(workspaceRoot),
    });

    const response = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(response.success).toBe(false);
    if (!response.success) expect(response.error.message).toContain("PSN-BASE");
  });

  it("con clientId: devuelve CLIENTES/<clientId> real y crea el esqueleto .kilo la primera vez", async () => {
    const { api, workspaceRoot } = await buildApi();
    const response = await api.execute(
      makeRequest("content-scope.resolve-root", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    const root = (response.data as { root: string }).root;
    expect(root).toBe(path.join(workspaceRoot, "CLIENTES", "mci-finance"));
    const stat = await fs.stat(path.join(root, ".kilo", "agents"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("con projectId: devuelve la ruta real del proyecto ya registrado", async () => {
    const { api, projectManager } = await buildApi();
    const projectPath = tempDir("dwm-content-scope-ctrl-project-");
    const project = await projectManager.createProject("Proyecto", "", {
      profileId: "p",
      projectPath,
      usedTools: [],
      usedAdapters: [],
    });

    const response = await api.execute(
      makeRequest("content-scope.resolve-root", { projectId: project.id }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (response.success) expect((response.data as { root: string }).root).toBe(projectPath);
  });

  it("falla con un mensaje claro si el proyecto no existe", async () => {
    const { api } = await buildApi();
    const response = await api.execute(
      makeRequest("content-scope.resolve-root", { projectId: "no-existe" }, { caller: admin })
    );
    expect(response.success).toBe(false);
  });

  it("nunca expone secretos: la respuesta solo contiene una ruta, nada de credenciales", async () => {
    const { api } = await buildApi();
    const response = await api.execute(
      makeRequest("content-scope.resolve-root", { clientId: "mci-finance" }, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (response.success) {
      expect(Object.keys(response.data as object)).toEqual(["root"]);
    }
  });
});
