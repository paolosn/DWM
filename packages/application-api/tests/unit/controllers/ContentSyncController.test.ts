import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { ProjectManager } from "@dwm/project";
import { ContentSyncService } from "@dwm/project-provisioning";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

describe("ContentSyncController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeKiloRoot(): Promise<string> {
    const root = tempDir("dwm-content-sync-ctrl-");
    await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    return root;
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
    const workspaceRoot = await makeKiloRoot();
    const projectPath = await makeKiloRoot();

    const psnAdapter = new PSNAdapter();
    await psnAdapter.scanWorkspace(workspaceRoot);
    await psnAdapter.scanWorkspace(projectPath);

    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    const contentSyncService = new ContentSyncService({
      psnAdapter,
      agentManager,
      skillManager,
      ruleManager,
    });

    const projectManager = {
      getProject: (id: string) =>
        id === "p1" ? { id, configuration: { projectPath } } : undefined,
    } as unknown as ProjectManager;

    const api = new ApplicationAPI({
      agentManager,
      skillManager,
      ruleManager,
      projectManager,
      contentSyncService,
      portableWorkspaceManager: fakeWorkspaceManager(workspaceRoot),
    });

    return { api, agentManager, workspaceRoot, projectPath };
  }

  it("content-sync.list-catalog devuelve el estado real (preview) de cada agente del catálogo global frente al proyecto", async () => {
    const { api, agentManager, workspaceRoot } = await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );

    const response = await api.execute(
      makeRequest(
        "content-sync.list-catalog",
        { kind: "agent", targetProjectId: "p1" },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const entries = response.data as { id: string; preview: { action: string } }[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "coordinador", preview: { action: "create" } });
  });

  it("content-sync.assign materializa el agente real en el .kilo del proyecto real", async () => {
    const { api, agentManager, workspaceRoot, projectPath } = await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );

    const response = await api.execute(
      makeRequest(
        "content-sync.assign",
        { kind: "agent", id: "coordinador", targetProjectId: "p1" },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    expect((response.data as { applied: boolean }).applied).toBe(true);
    const raw = await fs.readFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(raw).toContain("# Coordinador");
  });

  it("un conflicto real se rechaza sin confirmOverwrite, y el catálogo lo refleja como 'conflict'", async () => {
    const { api, agentManager, workspaceRoot, projectPath } = await buildApi();
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, workspaceRoot);
    await fs.writeFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "# Editado a mano en el proyecto\n",
      "utf-8"
    );

    const listResponse = await api.execute(
      makeRequest(
        "content-sync.list-catalog",
        { kind: "agent", targetProjectId: "p1" },
        { caller: admin }
      )
    );
    expect(listResponse.success).toBe(true);
    if (listResponse.success) {
      const entries = listResponse.data as { id: string; preview: { action: string } }[];
      expect(entries[0]?.preview.action).toBe("conflict");
    }

    const assignResponse = await api.execute(
      makeRequest(
        "content-sync.assign",
        { kind: "agent", id: "coordinador", targetProjectId: "p1" },
        { caller: admin }
      )
    );
    expect(assignResponse.success).toBe(true);
    if (assignResponse.success) {
      expect((assignResponse.data as { applied: boolean }).applied).toBe(false);
    }
    const raw = await fs.readFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(raw).toContain("Editado a mano");
  });

  it("confirmOverwrite: true aplica la sobrescritura real del conflicto", async () => {
    const { api, agentManager, workspaceRoot, projectPath } = await buildApi();
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, workspaceRoot);
    await fs.writeFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "# Anterior\n",
      "utf-8"
    );

    const response = await api.execute(
      makeRequest(
        "content-sync.assign",
        { kind: "agent", id: "coordinador", targetProjectId: "p1", confirmOverwrite: true },
        { caller: admin }
      )
    );
    expect(response.success).toBe(true);
    if (response.success) expect((response.data as { applied: boolean }).applied).toBe(true);
    const raw = await fs.readFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(raw).toContain("# Origen");
  });

  it("content-sync.withdraw retira realmente el fichero del proyecto, y list-catalog vuelve a mostrar 'create'", async () => {
    const { api, agentManager, workspaceRoot, projectPath } = await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );
    await api.execute(
      makeRequest(
        "content-sync.assign",
        { kind: "agent", id: "coordinador", targetProjectId: "p1" },
        { caller: admin }
      )
    );

    const withdrawResponse = await api.execute(
      makeRequest(
        "content-sync.withdraw",
        { kind: "agent", id: "coordinador", targetProjectId: "p1" },
        { caller: admin }
      )
    );
    expect(withdrawResponse.success).toBe(true);
    if (withdrawResponse.success) {
      expect((withdrawResponse.data as { withdrawn: boolean }).withdrawn).toBe(true);
    }
    await expect(
      fs.access(path.join(projectPath, ".kilo", "agents", "coordinador.md"))
    ).rejects.toThrow();

    const listAfter = await api.execute(
      makeRequest(
        "content-sync.list-catalog",
        { kind: "agent", targetProjectId: "p1" },
        { caller: admin }
      )
    );
    expect(listAfter.success).toBe(true);
    if (listAfter.success) {
      const entries = listAfter.data as { id: string; preview: { action: string } }[];
      expect(entries[0]?.preview.action).toBe("create");
    }
  });

  it("falla con un mensaje claro si el proyecto destino no existe", async () => {
    const { api, agentManager, workspaceRoot } = await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );

    const response = await api.execute(
      makeRequest(
        "content-sync.assign",
        { kind: "agent", id: "coordinador", targetProjectId: "no-existe" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });
});
