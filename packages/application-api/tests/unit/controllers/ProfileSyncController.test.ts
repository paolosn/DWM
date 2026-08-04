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
import { ProfileManager } from "@dwm/profile";
import { ContentSyncService, ProfileSyncService } from "@dwm/project-provisioning";
import type { PortableWorkspaceManager, WorkspaceRegistryEntry } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write"] as const };

describe("ProfileSyncController", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeKiloRoot(): Promise<string> {
    const root = tempDir("dwm-profile-sync-ctrl-");
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

    const projectManager = new ProjectManager({
      projectsDir: tempDir("dwm-profile-sync-ctrl-projects-"),
    });
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "perfil-1",
      projectPath,
      usedTools: [],
      usedAdapters: [],
    });

    const profileManager = new ProfileManager({
      profilesDir: tempDir("dwm-profile-sync-ctrl-profiles-"),
    });
    const profile = await profileManager.createProfile("Perfil Backend", "desc", {
      enabledTools: [],
      enabledAdapters: [],
      secretRefs: [],
      agentIds: ["coordinador"],
      skillIds: [],
      ruleIds: [],
    });

    const profileSyncService = new ProfileSyncService({ contentSyncService, projectManager });

    const api = new ApplicationAPI({
      projectManager,
      profileManager,
      profileSyncService,
      portableWorkspaceManager: fakeWorkspaceManager(workspaceRoot),
    });

    return {
      api,
      agentManager,
      projectId: project.id,
      profileId: profile.id,
      workspaceRoot,
      projectPath,
    };
  }

  it("profile-sync.preview devuelve el estado real de cada elemento del perfil frente al proyecto real", async () => {
    const { api, agentManager, projectId, profileId, workspaceRoot } = await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );

    const response = await api.execute(
      makeRequest(
        "profile-sync.preview",
        { profileId, targetProjectId: projectId },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { items: { id: string; preview: { action: string } }[] };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ id: "coordinador", preview: { action: "create" } });
  });

  it("profile-sync.apply materializa realmente el perfil en el .kilo del proyecto", async () => {
    const { api, agentManager, projectId, profileId, workspaceRoot, projectPath } =
      await buildApi();
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador\n" },
      workspaceRoot
    );

    const response = await api.execute(
      makeRequest(
        "profile-sync.apply",
        { profileId, targetProjectId: projectId },
        { caller: admin }
      )
    );

    expect(response.success).toBe(true);
    if (!response.success) return;
    const data = response.data as { applied: unknown[] };
    expect(data.applied).toHaveLength(1);
    const raw = await fs.readFile(
      path.join(projectPath, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(raw).toContain("# Coordinador");
  });

  it("falla con un mensaje claro si el perfil no existe", async () => {
    const { api, projectId } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "profile-sync.preview",
        { profileId: "no-existe", targetProjectId: projectId },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });

  it("falla con un mensaje claro si el proyecto no existe", async () => {
    const { api, profileId } = await buildApi();
    const response = await api.execute(
      makeRequest(
        "profile-sync.preview",
        { profileId, targetProjectId: "no-existe" },
        { caller: admin }
      )
    );
    expect(response.success).toBe(false);
  });
});
