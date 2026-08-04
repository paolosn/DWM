import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { ProjectManager } from "@dwm/project";
import { ConnectionsManager } from "@dwm/connections-manager";
import { SecretsManager } from "@dwm/secrets";
import { defaultProfileConfiguration, type ProfileConfiguration } from "@dwm/profile";
import { ContentSyncService } from "../../src/ContentSyncService.js";
import { ProfileSyncService } from "../../src/ProfileSyncService.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";

describe("ProfileSyncService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix = "dwm-profile-sync-"): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  async function makeRoot(): Promise<string> {
    const root = tempDir();
    await fs.mkdir(path.join(root, ".kilo", "agents"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "skills"), { recursive: true });
    await fs.mkdir(path.join(root, ".kilo", "rules"), { recursive: true });
    await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
    return root;
  }

  async function buildEnv() {
    const psnAdapter = new PSNAdapter();
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
      projectsDir: tempDir("dwm-profile-sync-projects-"),
    });
    const secretsManager = new SecretsManager({
      configuration: {
        secretsDir: tempDir("dwm-profile-sync-secrets-"),
        masterKey: "clave-maestra-profile",
      },
    });
    const connectionsManager = new ConnectionsManager({ secretsManager });
    const profileSync = new ProfileSyncService({
      contentSyncService,
      projectManager,
      connectionsManager,
    });
    return {
      psnAdapter,
      agentManager,
      skillManager,
      ruleManager,
      projectManager,
      connectionsManager,
      profileSync,
    };
  }

  const baseConfig: ProfileConfiguration = {
    ...defaultProfileConfiguration(),
    agentIds: ["coordinador"],
    skillIds: [],
    ruleIds: ["seguridad-codigo"],
  };

  it("preview real del perfil completo: cada agente/regla del paquete con su estado real", async () => {
    const { psnAdapter, agentManager, ruleManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);

    const preview = await profileSync.previewProfile(baseConfig, source, target);

    expect(preview.hasConflicts).toBe(false);
    expect(preview.items).toHaveLength(2);
    expect(preview.items.map((i) => i.id).sort()).toEqual(["coordinador", "seguridad-codigo"]);
    expect(preview.items.every((i) => i.preview.action === "create")).toBe(true);
  });

  it("aplicar el perfil materializa realmente cada agente/skill/regla en el .kilo del proyecto", async () => {
    const { psnAdapter, agentManager, ruleManager, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const result = await profileSync.applyProfile(baseConfig, source, target, project.id);

    expect(result.applied).toHaveLength(2);
    const agentRaw = await fs.readFile(
      path.join(target, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(agentRaw).toContain("# Coordinador");
    const ruleRaw = await fs.readFile(
      path.join(target, ".kilo", "rules", "seguridad-codigo.md"),
      "utf-8"
    );
    expect(ruleRaw).toContain("# Seguridad");
  });

  it("aplica la IA del perfil escribiendo la referencia real en ProjectConfiguration.settings.ai, vía ProjectManager", async () => {
    const { psnAdapter, agentManager, ruleManager, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const configWithAi: ProfileConfiguration = {
      ...baseConfig,
      defaultAIProviderId: "openai",
      aiProviderConfiguration: { model: "gpt-4o" },
    };
    const result = await profileSync.applyProfile(configWithAi, source, target, project.id);

    expect(result.aiApplied).toBe(true);
    const updated = projectManager.getProject(project.id);
    expect(updated?.configuration.settings?.["ai"]).toMatchObject({
      provider: "openai",
      model: "gpt-4o",
    });
  });

  it("aplica MCP opcional reutilizando el sistema de grants ya existente de ConnectionsManager (denegación por defecto salvo asignación explícita)", async () => {
    const {
      psnAdapter,
      agentManager,
      ruleManager,
      projectManager,
      connectionsManager,
      profileSync,
    } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const connection = await connectionsManager.create(source, {
      projectId: "perfil-mcp",
      name: "MCP GitHub",
      type: "mcp-stdio",
    });
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const configWithMcp: ProfileConfiguration = {
      ...baseConfig,
      mcpConnectionIds: [connection.id],
    };
    const result = await profileSync.applyProfile(configWithMcp, source, target, project.id);

    expect(result.mcpApplied).toEqual([connection.id]);
    const grants = await connectionsManager.listGrants(source, connection.id);
    expect(grants).toContainEqual(
      expect.objectContaining({ granteeId: project.id, capability: "client-connection.use" })
    );
  });

  it("conflicto real en el paquete: no aplica nada sin confirmación explícita", async () => {
    const { psnAdapter, agentManager, ruleManager, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, source);
    await agentManager.createAgent({ id: "coordinador", content: "# Editado a mano\n" }, target);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const result = await profileSync.applyProfile(baseConfig, source, target, project.id);

    expect(result.applied).toHaveLength(0);
    expect(result.items.some((i) => i.preview.action === "conflict")).toBe(true);
    const raw = await fs.readFile(path.join(target, ".kilo", "agents", "coordinador.md"), "utf-8");
    expect(raw).toContain("Editado a mano");
  });

  it("confirmOverwrite: true aplica el perfil completo incluso con conflictos reales", async () => {
    const { psnAdapter, agentManager, ruleManager, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, source);
    await agentManager.createAgent({ id: "coordinador", content: "# Anterior\n" }, target);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const result = await profileSync.applyProfile(baseConfig, source, target, project.id, {
      confirmOverwrite: true,
    });

    expect(result.applied.length).toBeGreaterThan(0);
    const raw = await fs.readFile(path.join(target, ".kilo", "agents", "coordinador.md"), "utf-8");
    expect(raw).toContain("# Origen");
  });

  it("rollback real a nivel de perfil: si un elemento falla a mitad de la aplicación, se retiran los ya aplicados en esa misma llamada", async () => {
    const { psnAdapter, agentManager, ruleManager, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const ruleSpy = vi
      .spyOn(ruleManager, "createRule")
      .mockRejectedValueOnce(new Error("fallo simulado al escribir la regla"));

    await expect(
      profileSync.applyProfile(baseConfig, source, target, project.id)
    ).rejects.toMatchObject({
      code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
    });
    ruleSpy.mockRestore();

    // El agente que sí se había llegado a materializar antes del fallo se retira.
    await expect(
      fs.access(path.join(target, ".kilo", "agents", "coordinador.md"))
    ).rejects.toThrow();
  });

  it("perfil sin composición (sin agentIds/skillIds/ruleIds): preview vacío, nada que aplicar", async () => {
    const { psnAdapter, projectManager, profileSync } = await buildEnv();
    const source = await makeRoot();
    await psnAdapter.scanWorkspace(source);
    const target = await makeRoot();
    await psnAdapter.scanWorkspace(target);
    const project = await projectManager.createProject("Proyecto de prueba", "", {
      profileId: "p",
      projectPath: target,
      usedTools: [],
      usedAdapters: [],
    });

    const preview = await profileSync.previewProfile(defaultProfileConfiguration(), source, target);
    expect(preview.items).toEqual([]);

    const result = await profileSync.applyProfile(
      defaultProfileConfiguration(),
      source,
      target,
      project.id
    );
    expect(result.applied).toEqual([]);
    expect(result.aiApplied).toBe(false);
    expect(result.mcpApplied).toEqual([]);
  });
});
