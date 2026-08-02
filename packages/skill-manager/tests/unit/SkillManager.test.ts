import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import { WorkspacePaths } from "@dwm/portable-workspace";
import { ImportManager } from "@dwm/import-manager";
import { PSNAdapter } from "@dwm/psn-adapter";
import type { VerificationManager } from "@dwm/verification";
import { SkillManager } from "../../src/SkillManager.js";
import { SkillErrorCode } from "../../src/errors/SkillErrorCode.js";
import { SKILL_FILE_NAME } from "../../src/SkillTypes.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeScannedPSNAdapter, makeWorkspaceWithSkills } from "./support/fixtures.js";

describe("SkillManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-skill-manager-core-"));
  }

  it("el constructor exige psnAdapter", () => {
    expect(
      () => new SkillManager({} as unknown as ConstructorParameters<typeof SkillManager>[0])
    ).toThrowError(expect.objectContaining({ code: SkillErrorCode.SKILL_INVALID_REQUEST }));
  });

  describe("resolución del directorio de skills", () => {
    it("lanza SKILL_DIRECTORY_UNRESOLVABLE si el Workspace no se ha escaneado", async () => {
      const manager = new SkillManager({ psnAdapter: new PSNAdapter() });
      await expect(manager.listSkills()).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_DIRECTORY_UNRESOLVABLE,
      });
    });

    it("lanza SKILL_DIRECTORY_UNRESOLVABLE si el Workspace no tiene el recurso skills", async () => {
      const root = tempDir();
      await fs.mkdir(path.join(root, "PSN-BASE"), { recursive: true });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.listSkills()).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_DIRECTORY_UNRESOLVABLE,
      });
    });
  });

  describe("listSkills()", () => {
    it("lista las skills reales del Workspace, excluyendo archivadas por defecto", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {
        activa: "# Activa\n",
        legada: "# Legada\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const list = await manager.listSkills();
      expect(list.map((s) => s.id).sort()).toEqual(["activa", "legada"]);

      await manager.archiveSkill("activa");
      expect((await manager.listSkills()).map((s) => s.id)).toEqual(["legada"]);
      expect((await manager.listSkills({ includeArchived: true })).map((s) => s.id).sort()).toEqual(
        ["activa", "legada"]
      );
    });

    it("incluye skills sin SKILL.md con hasSkillFile: false, sin lanzar", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { "sin-archivo": undefined });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const list = await manager.listSkills();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: "sin-archivo", hasSkillFile: false, archived: false });
    });

    it("incluye skills con SKILL.md inválido con hasSkillFile: false, sin lanzar", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, {});
      const rotaDir = path.join(skillsDir, "rota");
      await fs.mkdir(rotaDir, { recursive: true });
      await fs.writeFile(
        path.join(rotaDir, SKILL_FILE_NAME),
        "---\ntitle: X\nnunca se cierra\n",
        "utf-8"
      );

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const list = await manager.listSkills();
      expect(list[0]).toMatchObject({ id: "rota", hasSkillFile: false });
    });

    it("extrae el título de cada skill para su resumen", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { "con-titulo": "# Mi Título\nCuerpo.\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const [summary] = await manager.listSkills();
      expect(summary?.title).toBe("Mi Título");
    });

    it("devuelve [] si el directorio de skills está vacío", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      expect(await manager.listSkills()).toEqual([]);
    });
  });

  describe("getSkill() / getSkillFile() / getSkillMetadata()", () => {
    it("lee una skill existente con su contenido y metadatos", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { soporte: "# Soporte\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const skill = await manager.getSkill("soporte");
      expect(skill.id).toBe("soporte");
      expect(skill.content).toBe("# Soporte\n");
      expect(skill.metadata.archived).toBe(false);

      expect(await manager.getSkillFile("soporte")).toBe("# Soporte\n");
      expect(await manager.getSkillMetadata("soporte")).toEqual(skill.metadata);
    });

    it("lanza SKILL_NOT_FOUND si la skill no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.getSkill("no-existe")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });

    it("lanza SKILL_FILE_MISSING si la carpeta existe pero falta SKILL.md", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { "sin-archivo": undefined });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.getSkill("sin-archivo")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_FILE_MISSING,
      });
    });

    it("lanza SKILL_FILE_INVALID si SKILL.md tiene un frontmatter mal formado", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, {});
      const rotaDir = path.join(skillsDir, "rota");
      await fs.mkdir(rotaDir, { recursive: true });
      await fs.writeFile(
        path.join(rotaDir, SKILL_FILE_NAME),
        "---\ntitle: X\nnunca se cierra\n",
        "utf-8"
      );

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.getSkill("rota")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_FILE_INVALID,
      });
    });

    it("lanza SKILL_INVALID_ID para un id sintácticamente inseguro", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.getSkill("../fuera")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_INVALID_ID,
      });
    });
  });

  describe("detectSkillFileIssue()", () => {
    it('devuelve "ok", "missing" e "invalid" según el estado real', async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, {
        buena: "# X\n",
        "sin-archivo": undefined,
      });
      const rotaDir = path.join(skillsDir, "rota");
      await fs.mkdir(rotaDir, { recursive: true });
      await fs.writeFile(path.join(rotaDir, SKILL_FILE_NAME), "---\nnunca se cierra\n", "utf-8");

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      expect(await manager.detectSkillFileIssue("buena")).toBe("ok");
      expect(await manager.detectSkillFileIssue("sin-archivo")).toBe("missing");
      expect(await manager.detectSkillFileIssue("rota")).toBe("invalid");
    });

    it("lanza SKILL_NOT_FOUND si la carpeta de la skill no existe en absoluto", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.detectSkillFileIssue("no-existe")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });
  });

  describe("listAuxFiles() / readAuxFile()", () => {
    it("lista archivos auxiliares, incluidos ocultos y subcarpetas", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      await fs.mkdir(path.join(skillsDir, "skill1", "scripts"), { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "skill1", "scripts", "run.sh"),
        "#!/bin/sh\n",
        "utf-8"
      );
      await fs.writeFile(path.join(skillsDir, "skill1", ".env"), "SECRET=1\n", "utf-8");

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const auxFiles = await manager.listAuxFiles("skill1");
      expect(auxFiles.map((f) => f.relativePath).sort()).toEqual([
        ".env",
        "scripts",
        "scripts/run.sh",
      ]);
    });

    it("lanza SKILL_NOT_FOUND al listar auxiliares de una skill inexistente", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.listAuxFiles("no-existe")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });

    it("readAuxFile() lee el contenido de un archivo auxiliar concreto", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      await fs.writeFile(path.join(skillsDir, "skill1", "notas.txt"), "hola", "utf-8");

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      expect(await manager.readAuxFile("skill1", "notas.txt")).toBe("hola");
    });

    it("readAuxFile() lanza SKILL_UNSAFE_PATH ante path traversal", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.readAuxFile("skill1", "../../etc/passwd")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_UNSAFE_PATH,
      });
      await expect(manager.readAuxFile("skill1", "/etc/passwd")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_UNSAFE_PATH,
      });
    });
  });

  describe("createSkill()", () => {
    it("crea una skill nueva con metadatos iniciales", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const skill = await manager.createSkill({ id: "nueva", content: "# Nueva\n" });
      expect(skill.metadata.archived).toBe(false);
      expect(skill.metadata.createdAt).toBe(skill.metadata.updatedAt);

      const releida = await manager.getSkill("nueva");
      expect(releida.content).toBe("# Nueva\n");
    });

    it("lanza SKILL_ALREADY_EXISTS si el id ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { existente: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(
        manager.createSkill({ id: "existente", content: "# Y\n" })
      ).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_ALREADY_EXISTS,
      });
    });

    it("lanza SKILL_VALIDATION_FAILED si el contenido ya usa el frontmatter reservado dwm:", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(
        manager.createSkill({ id: "mala", content: "---\ndwm:\n  archived: true\n---\nX\n" })
      ).rejects.toMatchObject({ code: SkillErrorCode.SKILL_VALIDATION_FAILED });
    });
  });

  describe("updateSkill() / saveSkill()", () => {
    it("actualiza el contenido preservando createdAt y avanzando updatedAt", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const original = await manager.getSkill("skill1");

      await new Promise((resolve) => setTimeout(resolve, 5));
      const actualizada = await manager.updateSkill("skill1", "# Editada\n");
      expect(actualizada.content).toBe("# Editada\n");
      expect(actualizada.metadata.createdAt).toBe(original.metadata.createdAt);
      expect(actualizada.metadata.updatedAt).not.toBe(original.metadata.createdAt);
    });

    it("repara una skill cuyo SKILL.md estaba ausente", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { "sin-archivo": undefined });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const reparada = await manager.updateSkill("sin-archivo", "# Reparada\n");
      expect(reparada.content).toBe("# Reparada\n");
      expect(reparada.metadata.archived).toBe(false);
      expect(await manager.detectSkillFileIssue("sin-archivo")).toBe("ok");
    });

    it("lanza SKILL_NOT_FOUND al actualizar una skill cuya carpeta no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.updateSkill("no-existe", "# X\n")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });

    it("saveSkill() persiste un Skill completo ya materializado", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# Original\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const skill = await manager.getSkill("skill1");

      const saved = await manager.saveSkill({ ...skill, content: "# Guardada\n" });
      expect(saved.content).toBe("# Guardada\n");
      expect((await manager.getSkill("skill1")).content).toBe("# Guardada\n");
    });

    it("saveSkill() rechaza una estructura inválida", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(
        manager.saveSkill({
          id: "..",
          content: "# X\n",
          metadata: { archived: false, createdAt: "x", updatedAt: "x" },
        })
      ).rejects.toMatchObject({ code: SkillErrorCode.SKILL_INVALID_STRUCTURE });
    });
  });

  describe("duplicateSkill()", () => {
    it("duplica una skill completa: SKILL.md, subcarpetas y archivos ocultos, con metadatos propios", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, { original: "# Original\n" });
      await fs.mkdir(path.join(skillsDir, "original", "scripts"), { recursive: true });
      await fs.writeFile(
        path.join(skillsDir, "original", "scripts", "run.sh"),
        "#!/bin/sh\n",
        "utf-8"
      );
      await fs.writeFile(path.join(skillsDir, "original", ".oculto"), "oculto", "utf-8");

      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const duplicada = await manager.duplicateSkill("original", "copia");
      expect(duplicada.id).toBe("copia");
      expect(duplicada.content).toBe("# Original\n");
      expect(duplicada.metadata.archived).toBe(false);

      const auxFiles = (await manager.listAuxFiles("copia")).map((f) => f.relativePath).sort();
      expect(auxFiles).toEqual([".oculto", "scripts", "scripts/run.sh"]);
      expect(await manager.readAuxFile("copia", "scripts/run.sh")).toBe("#!/bin/sh\n");

      const original = await manager.getSkill("original");
      expect(original.content).toBe("# Original\n");
    });

    it("lanza SKILL_NOT_FOUND si el origen no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.duplicateSkill("no-existe", "copia")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });

    it("lanza SKILL_ALREADY_EXISTS si el destino ya existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.duplicateSkill("a", "b")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_ALREADY_EXISTS,
      });
    });
  });

  describe("deleteSkill()", () => {
    it("requiere confirmPermanent: true, si no lanza SKILL_DELETE_NOT_CONFIRMED", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      await expect(
        manager.deleteSkill("skill1", { confirmPermanent: false })
      ).rejects.toMatchObject({ code: SkillErrorCode.SKILL_DELETE_NOT_CONFIRMED });
      expect(await manager.getSkill("skill1")).toBeDefined();
    });

    it("elimina una skill existente de forma permanente cuando se confirma explícitamente", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      await manager.deleteSkill("skill1", { confirmPermanent: true });
      await expect(manager.getSkill("skill1")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });

    it("no elimina nada fuera de la carpeta exacta de la skill", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await manager.deleteSkill("a", { confirmPermanent: true });
      expect(await manager.getSkill("b")).toBeDefined();
    });

    it("lanza SKILL_NOT_FOUND si no existe", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(
        manager.deleteSkill("no-existe", { confirmPermanent: true })
      ).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });
  });

  describe("archiveSkill() / restoreSkill()", () => {
    it("archiva y restaura una skill sin mover ni renombrar su carpeta", async () => {
      const root = tempDir();
      const skillsDir = await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const archivada = await manager.archiveSkill("skill1");
      expect(archivada.metadata.archived).toBe(true);
      expect(typeof archivada.metadata.archivedAt).toBe("string");

      expect(await fs.readdir(skillsDir)).toEqual(["skill1"]);
      const rawArchivada = await fs.readFile(
        path.join(skillsDir, "skill1", SKILL_FILE_NAME),
        "utf-8"
      );
      expect(rawArchivada).toContain("dwm:");
      expect(rawArchivada).toContain("# X");

      const restaurada = await manager.restoreSkill("skill1");
      expect(restaurada.metadata.archived).toBe(false);
      expect(restaurada.metadata.archivedAt).toBeUndefined();
      expect(restaurada.content).toBe("# X\n");
    });

    it("preserva el frontmatter propio del autor al archivar", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "---\ntitle: Mi Skill\n---\n# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      const archivada = await manager.archiveSkill("skill1");
      expect(archivada.content).toContain("title: Mi Skill");
    });

    it("lanza SKILL_ALREADY_ARCHIVED si ya está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await manager.archiveSkill("skill1");
      await expect(manager.archiveSkill("skill1")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_ALREADY_ARCHIVED,
      });
    });

    it("lanza SKILL_NOT_ARCHIVED si no está archivada", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await expect(manager.restoreSkill("skill1")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_ARCHIVED,
      });
    });
  });

  describe("searchSkills() / filterSkills()", () => {
    it("busca por texto libre sobre el índice reconstruido", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {
        "skill-soporte": "# Soporte\n",
        "skill-ventas": "# Ventas\n",
      });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });

      expect((await manager.searchSkills("soporte")).map((s) => s.id)).toEqual(["skill-soporte"]);
    });

    it("filtra por estado archivado", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      await manager.archiveSkill("a");

      expect((await manager.filterSkills({ archived: true })).map((s) => s.id)).toEqual(["a"]);
      expect((await manager.filterSkills({ archived: false })).map((s) => s.id)).toEqual(["b"]);
    });
  });

  describe("validateSkillStructure()", () => {
    it("delega en SkillValidator", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, { skill1: "# X\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const manager = new SkillManager({ psnAdapter });
      const skill = await manager.getSkill("skill1");
      expect(manager.validateSkillStructure(skill).valid).toBe(true);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() siempre incluye psn-adapter y refleja el resto de dependencias", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const importManager = new ImportManager({ historyDir: tempDir() });
      const manager = new SkillManager({
        psnAdapter: new PSNAdapter(),
        configManager,
        workspacePaths,
        importManager,
      });
      expect(manager.listConnectedIntegrations()).toEqual(
        expect.arrayContaining(["psn-adapter", "config", "portable-workspace", "import-manager"])
      );
    });

    it("persiste su sección de configuración tras cada mutación", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new SkillManager({ psnAdapter, configManager });

      await manager.createSkill({ id: "skill1", content: "# X\n" });
      const section = await configManager.getSection<{ skills: number }>("skill-manager");
      expect(section?.skills).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior a una mutación falla, sin fallar la operación", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const logs: string[] = [];
      const logger = new Logger("skill-manager-test", {
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

      const manager = new SkillManager({
        psnAdapter,
        logger,
        verificationManager: fakeVerificationManager,
      });
      const skill = await manager.createSkill({ id: "skill1", content: "# X\n" });
      expect(skill.id).toBe("skill1");
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real para cada operación de escritura", async () => {
      const root = tempDir();
      await makeWorkspaceWithSkills(root, {});
      const psnAdapter = await makeScannedPSNAdapter(root);
      const eventBus = new EventBus();
      const received: string[] = [];
      for (const phase of ["created", "updated", "deleted", "duplicated", "archived", "restored"]) {
        eventBus.subscribe(`skill.${phase}`, () => {
          received.push(phase);
        });
      }

      const manager = new SkillManager({ psnAdapter, eventBus });
      await manager.createSkill({ id: "skill1", content: "# X\n" });
      await manager.updateSkill("skill1", "# Y\n");
      await manager.duplicateSkill("skill1", "copia");
      await manager.archiveSkill("skill1");
      await manager.restoreSkill("skill1");
      await manager.deleteSkill("skill1", { confirmPermanent: true });

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
    it("informa UNKNOWN si el Workspace no se ha escaneado, y OK con el recuento de skills en caso contrario", async () => {
      const manager = new SkillManager({ psnAdapter: new PSNAdapter() });
      const unknown = await manager.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const root = tempDir();
      await makeWorkspaceWithSkills(root, { a: "# A\n", b: "# B\n" });
      const psnAdapter = await makeScannedPSNAdapter(root);
      const managerConSkills = new SkillManager({ psnAdapter });
      await managerConSkills.listSkills();
      const ok = await managerConSkills.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
      expect(ok.detail?.["skills"]).toBe(2);
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new SkillManager({ psnAdapter: new PSNAdapter(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "skill-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("skill-manager");
      expect(section?.integrations).toContain("psn-adapter");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
