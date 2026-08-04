import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import { RuleManager } from "@dwm/rule-manager";
import { ContentSyncService } from "../../src/ContentSyncService.js";
import { ProjectProvisioningErrorCode } from "../../src/errors/ProjectProvisioningErrorCode.js";

describe("ContentSyncService", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-content-sync-"));
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

  function buildService() {
    const psnAdapter = new PSNAdapter();
    const agentManager = new AgentManager({ psnAdapter });
    const skillManager = new SkillManager({ psnAdapter });
    const ruleManager = new RuleManager({ psnAdapter });
    const service = new ContentSyncService({ psnAdapter, agentManager, skillManager, ruleManager });
    return { service, psnAdapter, agentManager, skillManager, ruleManager };
  }

  /** Crea un root real Y lo escanea con `psnAdapter` — necesario antes de usar los managers directamente en el setup de un test (ContentSyncService ya escanea por su cuenta, pero el setup del test no pasa por él). */
  async function makeScannedRoot(psnAdapter: PSNAdapter): Promise<string> {
    const root = await makeRoot();
    await psnAdapter.scanWorkspace(root);
    return root;
  }

  it("preview: 'create' cuando el destino no tiene el agente todavía", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);

    const preview = await service.previewAssign("agent", "coordinador", source, target);
    expect(preview).toEqual({ kind: "agent", id: "coordinador", action: "create" });
  });

  it("assign real: materializa el fichero .md real en el .kilo del proyecto destino", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);

    const result = await service.assign("agent", "coordinador", source, target);
    expect(result.applied).toBe(true);

    const filePath = path.join(target, ".kilo", "agents", "coordinador.md");
    const raw = await fs.readFile(filePath, "utf-8");
    expect(raw).toContain("# Coordinador");
  });

  it("preview: 'unchanged' si el contenido real ya coincide (aunque las fechas de dwm: difieran)", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await service.assign("agent", "coordinador", source, target);

    const preview = await service.previewAssign("agent", "coordinador", source, target);
    expect(preview.action).toBe("unchanged");
  });

  it("preview: 'conflict' si el destino ya tiene un contenido real distinto, y assign() lo rechaza sin confirmación explícita", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador (origen)\n" },
      source
    );
    await agentManager.createAgent(
      { id: "coordinador", content: "# Coordinador (editado a mano en el proyecto)\n" },
      target
    );

    const preview = await service.previewAssign("agent", "coordinador", source, target);
    expect(preview.action).toBe("conflict");
    expect(preview.reason).toBeDefined();

    const result = await service.assign("agent", "coordinador", source, target);
    expect(result.applied).toBe(false);
    expect(result.preview.action).toBe("conflict");

    // El contenido manual del destino nunca se toca sin confirmación explícita.
    const raw = await fs.readFile(path.join(target, ".kilo", "agents", "coordinador.md"), "utf-8");
    expect(raw).toContain("editado a mano");
  });

  it("assign con confirmOverwrite: true sobrescribe el conflicto de verdad", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, source);
    await agentManager.createAgent({ id: "coordinador", content: "# Anterior\n" }, target);

    const result = await service.assign("agent", "coordinador", source, target, {
      confirmOverwrite: true,
    });
    expect(result.applied).toBe(true);

    const raw = await fs.readFile(path.join(target, ".kilo", "agents", "coordinador.md"), "utf-8");
    expect(raw).toContain("# Origen");
  });

  it("rollback real: si falla a mitad de la escritura, el destino queda exactamente como estaba antes", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Origen\n" }, source);
    await agentManager.createAgent({ id: "coordinador", content: "# Anterior\n" }, target);

    const updateSpy = vi
      .spyOn(agentManager, "updateAgent")
      .mockRejectedValueOnce(new Error("fallo simulado de escritura"));

    await expect(
      service.assign("agent", "coordinador", source, target, { confirmOverwrite: true })
    ).rejects.toMatchObject({ code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED });

    updateSpy.mockRestore();
    const raw = await fs.readFile(path.join(target, ".kilo", "agents", "coordinador.md"), "utf-8");
    expect(raw).toContain("# Anterior");
  });

  it("asignar a dos proyectos y retirar de uno no afecta al otro", async () => {
    const { service, psnAdapter, agentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const projectA = await makeScannedRoot(psnAdapter);
    const projectB = await makeScannedRoot(psnAdapter);
    await agentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);

    await service.assign("agent", "coordinador", source, projectA);
    await service.assign("agent", "coordinador", source, projectB);

    const withdrawResult = await service.withdraw("agent", "coordinador", projectA);
    expect(withdrawResult.withdrawn).toBe(true);

    await expect(
      fs.access(path.join(projectA, ".kilo", "agents", "coordinador.md"))
    ).rejects.toThrow();
    const stillThere = await fs.readFile(
      path.join(projectB, ".kilo", "agents", "coordinador.md"),
      "utf-8"
    );
    expect(stillThere).toContain("# Coordinador");
  });

  it("retirar algo que no está asignado es seguro: no falla, solo informa", async () => {
    const { service, psnAdapter } = buildService();
    const target = await makeScannedRoot(psnAdapter);
    const result = await service.withdraw("agent", "no-asignado", target);
    expect(result.withdrawn).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("funciona igual para reglas (mismo mecanismo, sin duplicar lógica)", async () => {
    const { service, psnAdapter, ruleManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await ruleManager.createRule({ id: "seguridad-codigo", content: "# Seguridad\n" }, source);

    const result = await service.assign("rule", "seguridad-codigo", source, target);
    expect(result.applied).toBe(true);
    const raw = await fs.readFile(
      path.join(target, ".kilo", "rules", "seguridad-codigo.md"),
      "utf-8"
    );
    expect(raw).toContain("# Seguridad");
  });

  it("sincroniza una skill real, incluidos sus ficheros auxiliares (no solo SKILL.md)", async () => {
    const { service, psnAdapter, skillManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await skillManager.createSkill(
      {
        id: "checklist-produccion",
        content: "---\nname: checklist-produccion\n---\n\n# Checklist\n",
      },
      source
    );
    const skillDir = path.join(source, ".kilo", "skills", "checklist-produccion");
    await fs.writeFile(
      path.join(skillDir, "plantilla.md"),
      "Contenido de la plantilla real.",
      "utf-8"
    );

    const result = await service.assign("skill", "checklist-produccion", source, target);
    expect(result.applied).toBe(true);

    const skillMd = await fs.readFile(
      path.join(target, ".kilo", "skills", "checklist-produccion", "SKILL.md"),
      "utf-8"
    );
    expect(skillMd).toContain("# Checklist");
    const plantilla = await fs.readFile(
      path.join(target, ".kilo", "skills", "checklist-produccion", "plantilla.md"),
      "utf-8"
    );
    expect(plantilla).toBe("Contenido de la plantilla real.");
  });

  it("persistencia tras reiniciar: una instancia nueva del servicio lee exactamente lo mismo del disco", async () => {
    const { service: firstService, psnAdapter, agentManager: firstAgentManager } = buildService();
    const source = await makeScannedRoot(psnAdapter);
    const target = await makeScannedRoot(psnAdapter);
    await firstAgentManager.createAgent({ id: "coordinador", content: "# Coordinador\n" }, source);
    await firstService.assign("agent", "coordinador", source, target);

    // Instancia completamente nueva (simula reiniciar la aplicación): sin
    // ningún estado en memoria compartido con la anterior.
    const { service: secondService } = buildService();
    const preview = await secondService.previewAssign("agent", "coordinador", source, target);
    expect(preview.action).toBe("unchanged");
  });
});
