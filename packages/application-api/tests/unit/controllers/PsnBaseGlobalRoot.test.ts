import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { PortableWorkspaceManager } from "@dwm/portable-workspace";
import { ApplicationAPI } from "../../../src/ApplicationAPI.js";
import { makeRequest } from "../support/fixtures.js";

const admin = { grantedCapabilities: ["read", "write", "configure"] as const };

const AGENT_MD = `---
description: Agente real.
---

# Agente real
`;

const SKILL_MD = `# Skill real

Contenido real.
`;

const RULE_MD = `# Regla real
`;

describe("Biblioteca IA global resuelve PSN-BASE real (fix/kilo-psn-base-global-root)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(prefix: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  /**
   * Estructura EXACTA pedida:
   * SISTEMA-DE-TRABAJO/
   * └── PSN-BASE/
   *     └── .kilo/
   *         ├── agents/{coordinador.md, auditor.md}
   *         ├── skills/wordpress/SKILL.md
   *         └── rules/calidad.md
   */
  async function makeFixture(baseName = "SISTEMA-DE-TRABAJO"): Promise<string> {
    const parent = tempDir("dwm-psnbase-parent-");
    const workspaceRoot = path.join(parent, baseName);
    const kilo = path.join(workspaceRoot, "PSN-BASE", ".kilo");
    await fs.mkdir(path.join(kilo, "agents"), { recursive: true });
    await fs.mkdir(path.join(kilo, "skills", "wordpress"), { recursive: true });
    await fs.mkdir(path.join(kilo, "rules"), { recursive: true });
    await fs.writeFile(path.join(kilo, "agents", "coordinador.md"), AGENT_MD, "utf-8");
    await fs.writeFile(path.join(kilo, "agents", "auditor.md"), AGENT_MD, "utf-8");
    await fs.writeFile(path.join(kilo, "skills", "wordpress", "SKILL.md"), SKILL_MD, "utf-8");
    await fs.writeFile(path.join(kilo, "rules", "calidad.md"), RULE_MD, "utf-8");
    return workspaceRoot;
  }

  function buildApi(workspaceRoot: string, dataDir: string) {
    const psnAdapter = new PSNAdapter();
    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    const portableWorkspaceManager = new PortableWorkspaceManager({ startDir: dataDir });
    const api = new ApplicationAPI({
      psnAdapter,
      agentManager,
      skillManager,
      ruleManager,
      portableWorkspaceManager,
    });
    return { api, portableWorkspaceManager };
  }

  it("1: content-scope.resolve-root (Global) devuelve <Sistema>/PSN-BASE, no <Sistema>/.kilo ni la raíz del Sistema", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture();
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api } = buildApi(workspaceRoot, dataDir);
    await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );

    const response = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (!response.success) return;
    expect((response.data as { root: string }).root).toBe(path.join(workspaceRoot, "PSN-BASE"));
  });

  it("2-4: Agentes/Skills/Reglas ya existentes en PSN-BASE aparecen realmente en Biblioteca IA (coordinador, auditor, wordpress, calidad)", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture();
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api } = buildApi(workspaceRoot, dataDir);
    await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );

    const scope = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(scope.success).toBe(true);
    if (!scope.success) return;
    const root = (scope.data as { root: string }).root;

    const agents = await api.execute(makeRequest("agents.list", { root }, { caller: admin }));
    const skills = await api.execute(makeRequest("skills.list", { root }, { caller: admin }));
    const rules = await api.execute(makeRequest("rules.list", { root }, { caller: admin }));

    expect(agents.success && agents.data.map((a) => a.id).sort()).toEqual([
      "auditor",
      "coordinador",
    ]);
    expect(skills.success && skills.data.map((s) => s.id)).toEqual(["wordpress"]);
    expect(rules.success && rules.data.map((r) => r.id)).toEqual(["calidad"]);
  });

  it("5: 'Abrir carpeta' de Agentes en alcance global resuelve exactamente <Sistema>/PSN-BASE/.kilo/agents", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture();
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api } = buildApi(workspaceRoot, dataDir);
    await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );

    const scope = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(scope.success).toBe(true);
    if (!scope.success) return;
    const root = (scope.data as { root: string }).root;

    const folder = await api.execute(
      makeRequest("agents.get-folder-path", { root }, { caller: admin })
    );
    expect(folder.success).toBe(true);
    if (!folder.success) return;
    expect(folder.data.path).toBe(path.join(workspaceRoot, "PSN-BASE", ".kilo", "agents"));
  });

  it("6: mismo comportamiento con ruta estilo macOS", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture("SISTEMA-DE-TRABAJO-MAC");
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api } = buildApi(workspaceRoot, dataDir);
    await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );

    const response = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(response.success).toBe(true);
    if (response.success) {
      expect((response.data as { root: string }).root).toBe(path.join(workspaceRoot, "PSN-BASE"));
    }
  });

  it("7: ruta con espacios en el nombre real de la carpeta", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture("SISTEMA DE TRABAJO CON ESPACIOS");
    await new PortableWorkspaceManager({ startDir: dataDir }).initializeWorkspace(workspaceRoot);
    const { api } = buildApi(workspaceRoot, dataDir);
    await api.execute(
      makeRequest("workspace.register", { root: workspaceRoot }, { caller: admin })
    );

    const scope = await api.execute(
      makeRequest("content-scope.resolve-root", {}, { caller: admin })
    );
    expect(scope.success).toBe(true);
    if (!scope.success) return;
    const agents = await api.execute(
      makeRequest("agents.list", { root: (scope.data as { root: string }).root }, { caller: admin })
    );
    expect(agents.success && agents.data).toHaveLength(2);
  });

  it("8-9: tras 'reiniciar DWM' (instancias completamente nuevas sobre el mismo dataDir), sigue resolviendo PSN-BASE real y NUNCA reaparece una ruta interna del workspace de Electron", async () => {
    const dataDir = tempDir("dwm-psnbase-data-");
    const workspaceRoot = await makeFixture();
    const configDir = path.join(dataDir, "config");
    const { ConfigManager } = await import("@dwm/config");
    const firstConfigManager = new ConfigManager({ configDir });
    const firstWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager: firstConfigManager,
    });
    await firstWorkspaceManager.initializeWorkspace(workspaceRoot);
    await firstWorkspaceManager.registerActiveWorkspace(workspaceRoot);

    // "Reinicio" real: instancias completamente nuevas, mismo ConfigManager persistido en disco.
    const restartedConfigManager = new ConfigManager({ configDir });
    const restartedWorkspaceManager = new PortableWorkspaceManager({
      startDir: dataDir,
      configManager: restartedConfigManager,
    });
    const recoveredRoot = await restartedWorkspaceManager.locateOrRecoverActiveWorkspace(dataDir);
    expect(recoveredRoot).toBe(workspaceRoot);
    expect(recoveredRoot).not.toContain("AppData");
    expect(recoveredRoot).not.toContain("workspace" + path.sep + "SISTEMA-DE-TRABAJO-LIMPIO");

    const restartedPsnAdapter = new PSNAdapter();
    const restartedAgentManager = new AgentManager({ psnAdapter: restartedPsnAdapter });
    const psnBaseRoot = path.join(recoveredRoot!, "PSN-BASE");
    await restartedPsnAdapter.scanWorkspace(psnBaseRoot);
    const agents = await restartedAgentManager.listAgents({ root: psnBaseRoot });
    expect(agents.map((a) => a.id).sort()).toEqual(["auditor", "coordinador"]);
  });
});
