import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { AgentRepository } from "../../src/AgentRepository.js";
import { AgentErrorCode } from "../../src/errors/AgentErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("AgentRepository", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  const repository = new AgentRepository();

  describe("exists()", () => {
    it("es falso cuando el fichero no existe", async () => {
      expect(await repository.exists(tempDir(), "no-existe")).toBe(false);
    });

    it("es verdadero cuando el fichero existe", async () => {
      const dir = tempDir();
      await repository.write(
        dir,
        "agente-1",
        { name: "x" },
        {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      expect(await repository.exists(dir, "agente-1")).toBe(true);
    });
  });

  describe("read()", () => {
    it("devuelve undefined si el fichero no existe", async () => {
      expect(await repository.read(tempDir(), "no-existe")).toBeUndefined();
    });

    it("lee un agente escrito por write(), separando datos y metadatos", async () => {
      const dir = tempDir();
      const metadata = {
        archived: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
      };
      await repository.write(dir, "agente-1", { name: "x" }, metadata);

      const agent = await repository.read(dir, "agente-1");
      expect(agent).toBeDefined();
      expect(agent?.id).toBe("agente-1");
      expect(agent?.data).toEqual({ name: "x" });
      expect(agent?.metadata).toEqual(metadata);
    });

    it("infiere metadatos a partir de fs.stat cuando el fichero es legado (sin bloque __dwm)", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "legado.json"), "{}", "utf-8");

      const agent = await repository.read(dir, "legado");
      expect(agent?.data).toEqual({});
      expect(agent?.metadata.archived).toBe(false);
      expect(typeof agent?.metadata.createdAt).toBe("string");
      expect(typeof agent?.metadata.updatedAt).toBe("string");
      expect(agent?.metadata.archivedAt).toBeUndefined();
    });

    it("lanza AGENT_INVALID_STRUCTURE si el JSON es inválido", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "roto.json"), "{ esto no es json", "utf-8");

      await expect(repository.read(dir, "roto")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_INVALID_STRUCTURE,
      });
    });

    it("lanza AGENT_INVALID_STRUCTURE si el JSON no es un objeto plano", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "array.json"), "[1,2,3]", "utf-8");

      await expect(repository.read(dir, "array")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_INVALID_STRUCTURE,
      });
    });
  });

  describe("write()", () => {
    it("crea el directorio si no existe", async () => {
      const dir = path.join(tempDir(), "no-existe-aun");
      await repository.write(
        dir,
        "agente-1",
        {},
        {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      expect(await repository.exists(dir, "agente-1")).toBe(true);
    });
  });

  describe("delete()", () => {
    it("elimina un agente existente", async () => {
      const dir = tempDir();
      await repository.write(
        dir,
        "agente-1",
        {},
        {
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      await repository.delete(dir, "agente-1");
      expect(await repository.exists(dir, "agente-1")).toBe(false);
    });

    it("lanza AGENT_NOT_FOUND si el agente no existe", async () => {
      await expect(repository.delete(tempDir(), "no-existe")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_NOT_FOUND,
      });
    });
  });

  describe("listIds()", () => {
    it("devuelve [] si el directorio no existe", async () => {
      expect(await repository.listIds(path.join(tempDir(), "no-existe"))).toEqual([]);
    });

    it("lista solo los ficheros .json, ordenados y sin extensión", async () => {
      const dir = tempDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "b.json"), "{}", "utf-8");
      await fs.writeFile(path.join(dir, "a.json"), "{}", "utf-8");
      await fs.writeFile(path.join(dir, "notas.txt"), "no es un agente", "utf-8");

      expect(await repository.listIds(dir)).toEqual(["a", "b"]);
    });
  });

  describe("rutas de error no-ENOENT", () => {
    it("exists() envuelve un fallo inesperado (no ENOENT) como AGENT_READ_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.exists(fileAsDir, "agente")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_READ_FAILED,
      });
    });

    it("write() envuelve un fallo inesperado como AGENT_WRITE_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(
        repository.write(
          fileAsDir,
          "agente",
          {},
          {
            archived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        )
      ).rejects.toMatchObject({ code: AgentErrorCode.AGENT_WRITE_FAILED });
    });

    it("listIds() envuelve un fallo inesperado como AGENT_LIST_FAILED", async () => {
      const fileAsDir = tempDir();
      await fs.rm(fileAsDir, { recursive: true, force: true });
      await fs.writeFile(fileAsDir, "no es un directorio", "utf-8");

      await expect(repository.listIds(fileAsDir)).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_LIST_FAILED,
      });
    });

    it("delete() envuelve un fallo inesperado (no ENOENT) como AGENT_DELETE_FAILED", async () => {
      const dir = tempDir();
      await fs.mkdir(path.join(dir, "agente.json"), { recursive: true });

      await expect(repository.delete(dir, "agente")).rejects.toMatchObject({
        code: AgentErrorCode.AGENT_DELETE_FAILED,
      });
    });
  });
});
