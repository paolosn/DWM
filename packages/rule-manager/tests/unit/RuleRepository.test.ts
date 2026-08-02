import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { RuleRepository } from "../../src/RuleRepository.js";
import { RuleErrorCode } from "../../src/errors/RuleErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("RuleRepository", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  const repository = new RuleRepository();
  const baseMetadata = {
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  };

  describe("exists()", () => {
    it("es falso cuando el fichero no existe", async () => {
      expect(await repository.exists(tempDir(), "no-existe")).toBe(false);
    });

    it("es verdadero cuando el fichero existe", async () => {
      const dir = tempDir();
      await repository.write(dir, "regla-1", "# X\n", baseMetadata);
      expect(await repository.exists(dir, "regla-1")).toBe(true);
    });
  });

  describe("read()", () => {
    it("devuelve undefined si el fichero no existe", async () => {
      expect(await repository.read(tempDir(), "no-existe")).toBeUndefined();
    });

    it("lee una regla escrita por write(), separando contenido y metadatos", async () => {
      const dir = tempDir();
      await repository.write(dir, "regla-1", "---\ntitle: X\n---\n# Cuerpo\n", baseMetadata);
      const rule = await repository.read(dir, "regla-1");
      expect(rule?.id).toBe("regla-1");
      expect(rule?.content).toBe("---\ntitle: X\n---\n# Cuerpo\n");
      expect(rule?.metadata).toEqual(baseMetadata);
    });

    it("infiere metadatos a partir de fs.stat cuando el fichero es legado (sin bloque dwm:)", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "legada.md"), "# Legada\n", "utf-8");

      const rule = await repository.read(dir, "legada");
      expect(rule?.content).toBe("# Legada\n");
      expect(rule?.metadata.archived).toBe(false);
      expect(typeof rule?.metadata.createdAt).toBe("string");
      expect(typeof rule?.metadata.updatedAt).toBe("string");
      expect(rule?.metadata.archivedAt).toBeUndefined();
    });

    it("lanza RULE_INVALID_STRUCTURE si el frontmatter está mal formado", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "rota.md"), "---\ntitle: X\nnunca se cierra\n", "utf-8");

      await expect(repository.read(dir, "rota")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_INVALID_STRUCTURE,
      });
    });
  });

  describe("write()", () => {
    it("crea el directorio si no existe", async () => {
      const dir = path.join(tempDir(), "no-existe-aun");
      await repository.write(dir, "regla-1", "# X\n", baseMetadata);
      expect(await repository.exists(dir, "regla-1")).toBe(true);
    });

    it("preserva el frontmatter propio del autor junto al bloque dwm: reservado", async () => {
      const dir = tempDir();
      await repository.write(dir, "regla-1", "---\ntitle: X\n---\n# Cuerpo\n", baseMetadata);
      const raw = await fs.readFile(path.join(dir, "regla-1.md"), "utf-8");
      expect(raw).toContain("title: X");
      expect(raw).toContain("dwm:");
      expect(raw).toContain("# Cuerpo");
    });
  });

  describe("delete()", () => {
    it("elimina una regla existente", async () => {
      const dir = tempDir();
      await repository.write(dir, "regla-1", "# X\n", baseMetadata);
      await repository.delete(dir, "regla-1");
      expect(await repository.exists(dir, "regla-1")).toBe(false);
    });

    it("lanza RULE_NOT_FOUND si la regla no existe", async () => {
      await expect(repository.delete(tempDir(), "no-existe")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_NOT_FOUND,
      });
    });
  });

  describe("listIds()", () => {
    it("devuelve [] si el directorio no existe", async () => {
      expect(await repository.listIds(path.join(tempDir(), "no-existe"))).toEqual([]);
    });

    it("lista solo los ficheros .md, ordenados y sin extensión", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "b.md"), "# B\n", "utf-8");
      await fs.writeFile(path.join(dir, "a.md"), "# A\n", "utf-8");
      await fs.writeFile(path.join(dir, "notas.txt"), "no es una regla", "utf-8");

      expect(await repository.listIds(dir)).toEqual(["a", "b"]);
    });
  });

  describe("rutas de error no-ENOENT", () => {
    it("exists() envuelve un fallo inesperado (no ENOENT) como RULE_READ_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.exists(fileAsDir, "regla-1")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_READ_FAILED,
      });
    });

    it("write() envuelve un fallo inesperado como RULE_WRITE_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(
        repository.write(fileAsDir, "regla-1", "# X\n", baseMetadata)
      ).rejects.toMatchObject({
        code: RuleErrorCode.RULE_WRITE_FAILED,
      });
    });

    it("listIds() envuelve un fallo inesperado como RULE_LIST_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.listIds(fileAsDir)).rejects.toMatchObject({
        code: RuleErrorCode.RULE_LIST_FAILED,
      });
    });

    it("delete() envuelve un fallo inesperado (no ENOENT) como RULE_DELETE_FAILED", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "regla-1.md"), { recursive: true });

      await expect(repository.delete(dir, "regla-1")).rejects.toMatchObject({
        code: RuleErrorCode.RULE_DELETE_FAILED,
      });
    });
  });
});
