import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { SkillRepository } from "../../src/SkillRepository.js";
import { SkillErrorCode } from "../../src/errors/SkillErrorCode.js";
import { SKILL_FILE_NAME } from "../../src/SkillTypes.js";
import { makeTempDir } from "./support/tempDir.js";

describe("SkillRepository", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  const repository = new SkillRepository();
  const baseMetadata = {
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  };

  describe("exists() / existsSkillFile()", () => {
    it("son falsos si la skill no existe", async () => {
      const dir = tempDir();
      expect(await repository.exists(dir, "no-existe")).toBe(false);
      expect(await repository.existsSkillFile(dir, "no-existe")).toBe(false);
    });

    it("exists() es verdadero con la carpeta creada aunque falte SKILL.md", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "sin-skillmd"), { recursive: true });
      expect(await repository.exists(dir, "sin-skillmd")).toBe(true);
      expect(await repository.existsSkillFile(dir, "sin-skillmd")).toBe(false);
    });

    it("ambos son verdaderos tras write()", async () => {
      const dir = tempDir();
      await repository.write(dir, "skill-1", "# X\n", baseMetadata);
      expect(await repository.exists(dir, "skill-1")).toBe(true);
      expect(await repository.existsSkillFile(dir, "skill-1")).toBe(true);
    });
  });

  describe("inspectSkillFile()", () => {
    it('devuelve "missing" si SKILL.md no existe', async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "vacia"), { recursive: true });
      expect(await repository.inspectSkillFile(dir, "vacia")).toBe("missing");
    });

    it('devuelve "invalid" si el frontmatter está mal formado', async () => {
      const dir = tempDir();
      const skillDir = path.join(dir, "rota");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, SKILL_FILE_NAME),
        "---\ntitle: X\nnunca se cierra\n",
        "utf-8"
      );
      expect(await repository.inspectSkillFile(dir, "rota")).toBe("invalid");
    });

    it('devuelve "ok" para un SKILL.md válido', async () => {
      const dir = tempDir();
      await repository.write(dir, "buena", "# X\n", baseMetadata);
      expect(await repository.inspectSkillFile(dir, "buena")).toBe("ok");
    });
  });

  describe("read()", () => {
    it("devuelve undefined si la carpeta de la skill no existe en absoluto", async () => {
      expect(await repository.read(tempDir(), "no-existe")).toBeUndefined();
    });

    it("lanza SKILL_FILE_MISSING si la carpeta existe pero falta SKILL.md", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "sin-archivo"), { recursive: true });
      await expect(repository.read(dir, "sin-archivo")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_FILE_MISSING,
      });
    });

    it("lanza SKILL_FILE_INVALID si el frontmatter está mal formado", async () => {
      const dir = tempDir();
      const skillDir = path.join(dir, "rota");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, SKILL_FILE_NAME),
        "---\ntitle: X\nnunca se cierra\n",
        "utf-8"
      );
      await expect(repository.read(dir, "rota")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_FILE_INVALID,
      });
    });

    it("lee una skill escrita por write(), separando contenido y metadatos", async () => {
      const dir = tempDir();
      await repository.write(dir, "skill-1", "---\ntitle: X\n---\n# Cuerpo\n", baseMetadata);
      const skill = await repository.read(dir, "skill-1");
      expect(skill?.id).toBe("skill-1");
      expect(skill?.content).toBe("---\ntitle: X\n---\n# Cuerpo\n");
      expect(skill?.metadata).toEqual(baseMetadata);
    });

    it("infiere metadatos a partir de fs.stat cuando SKILL.md es legado (sin bloque dwm:)", async () => {
      const dir = tempDir();
      const skillDir = path.join(dir, "legada");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, SKILL_FILE_NAME), "# Legada\n", "utf-8");

      const skill = await repository.read(dir, "legada");
      expect(skill?.content).toBe("# Legada\n");
      expect(skill?.metadata.archived).toBe(false);
      expect(typeof skill?.metadata.createdAt).toBe("string");
      expect(typeof skill?.metadata.updatedAt).toBe("string");
      expect(skill?.metadata.archivedAt).toBeUndefined();
    });
  });

  describe("write()", () => {
    it("crea la carpeta de la skill si no existe", async () => {
      const dir = tempDir();
      await repository.write(dir, "nueva", "# X\n", baseMetadata);
      expect(await repository.exists(dir, "nueva")).toBe(true);
    });

    it("preserva el frontmatter propio del autor junto al bloque dwm: reservado", async () => {
      const dir = tempDir();
      await repository.write(dir, "skill-1", "---\ntitle: X\n---\n# Cuerpo\n", baseMetadata);
      const raw = await fs.readFile(path.join(dir, "skill-1", SKILL_FILE_NAME), "utf-8");
      expect(raw).toContain("title: X");
      expect(raw).toContain("dwm:");
      expect(raw).toContain("# Cuerpo");
    });
  });

  describe("listAuxFiles()", () => {
    it("devuelve [] si la carpeta no existe", async () => {
      expect(await repository.listAuxFiles(tempDir(), "no-existe")).toEqual([]);
    });

    it("lista archivos y carpetas auxiliares, incluidos ocultos, excluyendo SKILL.md", async () => {
      const dir = tempDir();
      const skillDir = path.join(dir, "skill-1");
      await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
      await fs.writeFile(path.join(skillDir, SKILL_FILE_NAME), "# X\n", "utf-8");
      await fs.writeFile(path.join(skillDir, "scripts", "build.sh"), "#!/bin/sh\n", "utf-8");
      await fs.writeFile(path.join(skillDir, ".hidden"), "oculto", "utf-8");

      const auxFiles = await repository.listAuxFiles(dir, "skill-1");
      const relativePaths = auxFiles.map((f) => f.relativePath).sort();
      expect(relativePaths).toEqual([".hidden", "scripts", "scripts/build.sh"]);
      expect(relativePaths).not.toContain(SKILL_FILE_NAME);

      const scriptEntry = auxFiles.find((f) => f.relativePath === "scripts/build.sh");
      expect(scriptEntry?.isDirectory).toBe(false);
      expect(typeof scriptEntry?.size).toBe("number");

      const folderEntry = auxFiles.find((f) => f.relativePath === "scripts");
      expect(folderEntry?.isDirectory).toBe(true);
    });
  });

  describe("readAuxFile()", () => {
    it("lee el contenido de un archivo auxiliar", async () => {
      const dir = tempDir();
      const skillDir = path.join(dir, "skill-1");
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(path.join(skillDir, "notas.txt"), "contenido auxiliar", "utf-8");

      expect(await repository.readAuxFile(dir, "skill-1", "notas.txt")).toBe("contenido auxiliar");
    });

    it("lanza SKILL_UNSAFE_PATH ante un intento de path traversal", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "skill-1"), { recursive: true });
      await expect(
        repository.readAuxFile(dir, "skill-1", "../../etc/passwd")
      ).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_UNSAFE_PATH,
      });
    });

    it("lanza SKILL_NOT_FOUND si el archivo auxiliar no existe", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "skill-1"), { recursive: true });
      await expect(repository.readAuxFile(dir, "skill-1", "no-existe.txt")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });
  });

  describe("copyTree()", () => {
    it("copia toda la carpeta, incluidos subcarpetas y ficheros ocultos", async () => {
      const dir = tempDir();
      const sourceDir = path.join(dir, "origen");
      await fs.mkdir(path.join(sourceDir, "sub"), { recursive: true });
      await fs.writeFile(path.join(sourceDir, SKILL_FILE_NAME), "# X\n", "utf-8");
      await fs.writeFile(path.join(sourceDir, "sub", "plantilla.tpl"), "plantilla", "utf-8");
      await fs.writeFile(path.join(sourceDir, ".oculto"), "oculto", "utf-8");

      await repository.copyTree(dir, "origen", "copia");

      expect(await fs.readFile(path.join(dir, "copia", SKILL_FILE_NAME), "utf-8")).toBe("# X\n");
      expect(await fs.readFile(path.join(dir, "copia", "sub", "plantilla.tpl"), "utf-8")).toBe(
        "plantilla"
      );
      expect(await fs.readFile(path.join(dir, "copia", ".oculto"), "utf-8")).toBe("oculto");
    });

    it("lanza SKILL_COPY_FAILED si el destino ya existe", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "origen"), { recursive: true });
      await fs.mkdir(path.join(dir, "destino"), { recursive: true });
      await expect(repository.copyTree(dir, "origen", "destino")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_COPY_FAILED,
      });
    });
  });

  describe("removeTree()", () => {
    it("elimina la carpeta exacta de la skill", async () => {
      const dir = tempDir();
      await repository.write(dir, "skill-1", "# X\n", baseMetadata);
      await repository.removeTree(dir, "skill-1");
      expect(await repository.exists(dir, "skill-1")).toBe(false);
    });

    it("no toca nada fuera de la carpeta de la skill", async () => {
      const dir = tempDir();
      await repository.write(dir, "skill-1", "# X\n", baseMetadata);
      await repository.write(dir, "skill-2", "# Y\n", baseMetadata);
      await repository.removeTree(dir, "skill-1");
      expect(await repository.exists(dir, "skill-2")).toBe(true);
    });

    it("lanza SKILL_NOT_FOUND si la skill no existe", async () => {
      await expect(repository.removeTree(tempDir(), "no-existe")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_NOT_FOUND,
      });
    });
  });

  describe("listIds()", () => {
    it("devuelve [] si el directorio no existe", async () => {
      expect(await repository.listIds(path.join(tempDir(), "no-existe"))).toEqual([]);
    });

    it("lista solo las subcarpetas, ordenadas, ignorando ficheros sueltos", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "b"), { recursive: true });
      await fs.mkdir(path.join(dir, "a"), { recursive: true });
      await fs.writeFile(path.join(dir, "no-es-una-skill.txt"), "x", "utf-8");

      expect(await repository.listIds(dir)).toEqual(["a", "b"]);
    });
  });

  describe("statSkillDir()", () => {
    it("devuelve undefined si la carpeta no existe", async () => {
      expect(await repository.statSkillDir(tempDir(), "no-existe")).toBeUndefined();
    });

    it("devuelve fechas ISO de la carpeta si existe", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "skill-1"), { recursive: true });
      const stat = await repository.statSkillDir(dir, "skill-1");
      expect(typeof stat?.createdAt).toBe("string");
      expect(typeof stat?.updatedAt).toBe("string");
    });
  });

  describe("rutas de error no-ENOENT", () => {
    it("exists() envuelve un fallo inesperado (no ENOENT) como SKILL_READ_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.exists(fileAsDir, "skill-1")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_READ_FAILED,
      });
    });

    it("write() envuelve un fallo inesperado como SKILL_WRITE_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(
        repository.write(fileAsDir, "skill-1", "# X\n", baseMetadata)
      ).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_WRITE_FAILED,
      });
    });

    it("listIds() envuelve un fallo inesperado como SKILL_LIST_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.listIds(fileAsDir)).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_LIST_FAILED,
      });
    });

    it("removeTree() envuelve un fallo inesperado (no ENOENT) como SKILL_DELETE_FAILED", async () => {
      const dir = tempDir();
      const parentIsFile = path.join(dir, "parent-es-un-fichero");
      await fs.writeFile(parentIsFile, "no es un directorio", "utf-8");

      await expect(repository.removeTree(parentIsFile, "skill-1")).rejects.toMatchObject({
        code: SkillErrorCode.SKILL_DELETE_FAILED,
      });
    });
  });
});
