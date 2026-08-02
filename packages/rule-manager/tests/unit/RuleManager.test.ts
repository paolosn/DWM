import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import { WorkspacePaths } from "@dwm/portable-workspace";
import { ImportManager } from "@dwm/import-manager";
import { PSNAdapter } from "@dwm/psn-adapter";
import { AgentManager } from "@dwm/agent-manager";
import { SkillManager } from "@dwm/skill-manager";
import type { VerificationManager } from "@dwm/verification";
import { RuleManager } from "../../src/RuleManager.js";
import { RuleErrorCode } from "../../src/errors/RuleErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeScannedPSNAdapter, makeWorkspaceWithRules } from "./support/fixtures.js";

describe("RuleManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-rule-manager-core-"));
  }

  it("el constructor exige psnAdapter", () => {
    expect(
      () => new RuleManager({} as unknown as ConstructorParameters<typeof RuleManager>[0])
    ).toThrowError(expect.objectContaining({ code: RuleErrorCode.RULE_INVALID_REQUEST }));
  });

  describe("resolución del directorio de reglas", () => {
    it("lanza RULE_DIRECTORY_UNRESOLVABLE si el Workspace no se ha escaneado", async () => {
      const manager = new RuleManager({ psnAdapter: new PSNAdapter() });
      await expect(manager.listRules()).rejects.toMatchObject({
        code: RuleErrorCode.RULE_DIRECTORY_UNRESOLVABLE,
      });
    });

    it("lanza RULE_DIRECTORY_UNRESOLVABLE si el Workspace no tiene el recurso rules", async () => {
      const root = tempDir();
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.listRules()).rejects.toMatchObject({
        code: RuleErrorCode.RULE_DIRECTORY_UNRESOLVABLE,
      });
    });
  });

  describe("listRules()", () => {
    it("lista las reglas reales del Workspace, excluyendo archivadas por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {
        activa: "# Activa\n",
        legada: "# Legada\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const list = await manager.listRules();
      expect(list.map((s) => s.id).sort()).toEqual(["activa", "legada"]);

      await manager.archiveRule("activa");
      expect((await manager.listRules()).map((s) => s.id)).toEqual(["legada"]);
      expect((await manager.listRules({ includeArchived: true })).map((s) => s.id).sort()).toEqual([
        "activa",
        "legada",
      ]);
    });

    it("extrae el título de cada regla para su resumen", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { "con-titulo": "# Mi Título\nCuerpo.\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      const [summary] = await manager.listRules();
      expect(summary?.title).toBe("Mi Título");
    });

    it("devuelve [] si el directorio de reglas está vacío", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      expect(await manager.listRules()).toEqual([]);
    });
  });

  describe("getRule() / getRuleMetadata()", () => {
    it("lee una regla existente con su contenido y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { soporte: "# Soporte\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const rule = await manager.getRule("soporte");
      expect(rule.id).toBe("soporte");
      expect(rule.content).toBe("# Soporte\n");
      expect(rule.metadata.archived).toBe(false);

      expect(await manager.getRuleMetadata("soporte")).toEqual(rule.metadata);
    });

    it("lanza RULE_NOT_FOUND si la regla no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.getRule("no-existe")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });

    it("lanza RULE_INVALID_ID para un id sintácticamente inseguro", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.getRule("../fuera")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_INVALID_ID,
      });
    });
  });

  describe("createRule()", () => {
    it("crea una regla nueva con metadatos iniciales", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const rule = await manager.createRule({ id: "nueva", content: "# Nueva\n" });
      expect(rule.metadata.archived).toBe(false);
      expect(rule.metadata.createdAt).toBe(rule.metadata.updatedAt);

      expect((await manager.getRule("nueva")).content).toBe("# Nueva\n");
    });

    it("lanza RULE_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { existente: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.createRule({ id: "existente", content: "# Y\n" })).rejects.toMatchObject(
        {
          code: RuleErrorCode.RULE_ALREADY_EXISTS,
        }
      );
    });

    it("lanza RULE_VALIDATION_FAILED si el contenido ya usa el frontmatter reservado dwm:", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(
        manager.createRule({ id: "mala", content: "---\ndwm:\n  archived: true\n---\nX\n" })
      ).rejects.toMatchObject({ code: RuleErrorCode.RULE_VALIDATION_FAILED });
    });
  });

  describe("updateRule() / saveRule()", () => {
    it("actualiza el contenido preservando createdAt y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      const original = await manager.getRule("regla1");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const actualizada = await manager.updateRule("regla1", "# Editada\n");
      expect(actualizada.content).toBe("# Editada\n");
      expect(actualizada.metadata.createdAt).toBe(original.metadata.createdAt);
      expect(actualizada.metadata.updatedAt).not.toBe(original.metadata.createdAt);
    });

    it("lanza RULE_NOT_FOUND al actualizar una regla inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.updateRule("no-existe", "# X\n")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });

    it("saveRule() persiste un Rule completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      const rule = await manager.getRule("regla1");

      const saved = await manager.saveRule({ ...rule, content: "# Guardada\n" });
      expect(saved.content).toBe("# Guardada\n");
      expect((await manager.getRule("regla1")).content).toBe("# Guardada\n");
    });

    it("saveRule() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(
        manager.saveRule({
          id: "..",
          content: "# X\n",
          metadata: { archived: false, createdAt: "x", updatedAt: "x" },
        })
      ).rejects.toMatchObject({ code: RuleErrorCode.RULE_INVALID_STRUCTURE });
    });
  });

  describe("duplicateRule()", () => {
    it("duplica una regla existente con un nuevo id y metadatos propios", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { original: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const duplicada = await manager.duplicateRule("original", "copia");
      expect(duplicada.id).toBe("copia");
      expect(duplicada.content).toBe("# Original\n");
      expect(duplicada.metadata.archived).toBe(false);

      expect((await manager.getRule("original")).content).toBe("# Original\n");
    });

    it("lanza RULE_NOT_FOUND si el origen no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.duplicateRule("no-existe", "copia")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });

    it("lanza RULE_ALREADY_EXISTS si el destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.duplicateRule("a", "b")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteRule()", () => {
    it("elimina una regla existente", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      await manager.deleteRule("regla1");
      await expect(manager.getRule("regla1")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });

    it("lanza RULE_NOT_FOUND si no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.deleteRule("no-existe")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });
  });

  describe("archiveRule() / restoreRule()", () => {
    it("archiva y restaura una regla sin mover ni renombrar su fichero", async () => {
      const root = tempDir();
      const rulesDir = await makeWorkspaceWithRules(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const archivada = await manager.archiveRule("regla1");
      expect(archivada.metadata.archived).toBe(true);
      expect(typeof archivada.metadata.archivedAt).toBe("string");

      const { promises: fs } = await import("node:fs");
      expect(await fs.readdir(rulesDir)).toEqual(["regla1.md"]);

      const restaurada = await manager.restoreRule("regla1");
      expect(restaurada.metadata.archived).toBe(false);
      expect(restaurada.metadata.archivedAt).toBeUndefined();
      expect(restaurada.content).toBe("# X\n");
    });

    it("preserva el frontmatter propio del autor al archivar", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "---\ntitle: Mi Regla\n---\n# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      const archivada = await manager.archiveRule("regla1");
      expect(archivada.content).toContain("title: Mi Regla");
    });

    it("lanza RULE_ALREADY_ARCHIVED si ya está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await manager.archiveRule("regla1");
      await expect(manager.archiveRule("regla1")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_ALREADY_ARCHIVED,
      });
    });

    it("lanza RULE_NOT_ARCHIVED si no está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await expect(manager.restoreRule("regla1")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_ARCHIVED,
      });
    });
  });

  describe("searchRules() / filterRules()", () => {
    it("busca por texto libre sobre el índice reconstruido", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {
        "regla-soporte": "# Soporte\n",
        "regla-ventas": "# Ventas\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });

      expect((await manager.searchRules("soporte")).map((s) => s.id)).toEqual(["regla-soporte"]);
    });

    it("filtra por estado archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      await manager.archiveRule("a");

      expect((await manager.filterRules({ archived: true })).map((s) => s.id)).toEqual(["a"]);
      expect((await manager.filterRules({ archived: false })).map((s) => s.id)).toEqual(["b"]);
    });
  });

  describe("validateRuleStructure()", () => {
    it("delega en RuleValidator", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, { regla1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new RuleManager({ psnAdapter });
      const rule = await manager.getRule("regla1");
      expect(manager.validateRuleStructure(rule).valid).toBe(true);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() siempre incluye psn-adapter y refleja el resto de dependencias, incluidas agent-manager y skill-manager", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const importManager = new ImportManager({ historyDir: tempDir() });
      const agentManager = new AgentManager({ psnAdapter: new PSNAdapter() });
      const skillManager = new SkillManager({ psnAdapter: new PSNAdapter() });
      const manager = new RuleManager({
        psnAdapter: new PSNAdapter(),
        configManager,
        workspacePaths,
        importManager,
        agentManager,
        skillManager,
      });
      expect(manager.listConnectedIntegrations()).toEqual(
        expect.arrayContaining([
          "psn-adapter",
          "config",
          "portable-workspace",
          "import-manager",
          "agent-manager",
          "skill-manager",
        ])
      );
    });

    it("persiste su sección de configuración tras cada mutación", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new RuleManager({ psnAdapter, configManager });

      await manager.createRule({ id: "regla1", content: "# X\n" });
      const section = await configManager.getSection<{ rules: number }>("rule-manager");
      expect(section?.rules).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior a una mutación falla, sin fallar la operación", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const logs: string[] = [];
      const logger = new Logger("rule-manager-test", {
        minLevel: LogLevel.INFO,
        transports: [
          {
            write: async (entry) => {
              logs.push(entry.message);
            },
          },
        ],
      });
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;

      const manager = new RuleManager({
        psnAdapter,
        logger,
        verificationManager: fakeVerificationManager,
      });
      const rule = await manager.createRule({ id: "regla1", content: "# X\n" });
      expect(rule.id).toBe("regla1");
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real para cada operación de escritura", async () => {
      const root = tempDir();
      await makeWorkspaceWithRules(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const eventBus = new EventBus();
      const received: string[] = [];
      for (const phase of ["created", "updated", "deleted", "duplicated", "archived", "restored"]) {
        eventBus.subscribe(`rule.${phase}`, () => {
          received.push(phase);
        });
      }

      const manager = new RuleManager({ psnAdapter, eventBus });
      await manager.createRule({ id: "regla1", content: "# X\n" });
      await manager.updateRule("regla1", "# Y\n");
      await manager.duplicateRule("regla1", "copia");
      await manager.archiveRule("regla1");
      await manager.restoreRule("regla1");
      await manager.deleteRule("regla1");

      expect(received).toEqual([
        "created",
        "updated",
        "duplicated",
        "archived",
        "restored",
        "deleted",
      ]);
    });
  });

  describe("toStatusProvider()", () => {
    it("informa UNKNOWN si el Workspace no se ha escaneado, y OK con el recuento de reglas en caso contrario", async () => {
      const manager = new RuleManager({ psnAdapter: new PSNAdapter() });
      const unknown = await manager.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const root = tempDir();
      await makeWorkspaceWithRules(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConReglas = new RuleManager({ psnAdapter });
      await managerConReglas.listRules();
      const ok = await managerConReglas.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
      expect(ok.detail?.["rules"]).toBe(2);
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new RuleManager({ psnAdapter: new PSNAdapter(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "rule-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("rule-manager");
      expect(section?.integrations).toContain("psn-adapter");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
