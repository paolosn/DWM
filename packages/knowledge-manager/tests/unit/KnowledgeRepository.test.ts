import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { KnowledgeRepository } from "../../src/KnowledgeRepository.js";
import { KnowledgeError } from "../../src/errors/KnowledgeError.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";
import type { KnowledgeMetadata } from "../../src/KnowledgeTypes.js";
import { makeTempDir } from "./support/tempDir.js";

const baseMetadata: KnowledgeMetadata = {
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tags: ["backend"],
  relations: [],
};

describe("KnowledgeRepository", () => {
  const repository = new KnowledgeRepository();
  let temp: { dir: string; cleanup: () => void };

  beforeEach(() => {
    temp = makeTempDir();
  });

  afterEach(() => {
    temp.cleanup();
  });

  it("exists() es falso para un id que no existe, incluso sin directorio creado", async () => {
    expect(await repository.exists(temp.dir, "nota.md")).toBe(false);
  });

  it("write() crea directorios anidados según haga falta y read() devuelve el elemento", async () => {
    await repository.write(temp.dir, "guias/onboarding.md", "# Onboarding\n", baseMetadata);
    expect(await repository.exists(temp.dir, "guias/onboarding.md")).toBe(true);

    const item = await repository.read(temp.dir, "guias/onboarding.md");
    expect(item?.id).toBe("guias/onboarding.md");
    expect(item?.content).toBe("# Onboarding\n");
    expect(item?.metadata.tags).toEqual(["backend"]);
  });

  it("read() devuelve undefined si el fichero no existe", async () => {
    expect(await repository.read(temp.dir, "no-existe.md")).toBeUndefined();
  });

  it("read() preserva el frontmatter propio del autor, sin el bloque dwm:", async () => {
    await repository.write(
      temp.dir,
      "nota.md",
      '---\ntitle: "Mi nota"\n---\ncuerpo\n',
      baseMetadata
    );
    const item = await repository.read(temp.dir, "nota.md");
    expect(item?.content).toBe('---\ntitle: "Mi nota"\n---\ncuerpo\n');
  });

  it("read() lanza KNOWLEDGE_INVALID_STRUCTURE ante frontmatter mal formado", async () => {
    const filePath = path.join(temp.dir, "roto.md");
    await fs.writeFile(filePath, "---\nsin cierre\n", "utf-8");
    await expect(repository.read(temp.dir, "roto.md")).rejects.toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_STRUCTURE })
    );
  });

  it("write() sobrescribe por completo un elemento existente", async () => {
    await repository.write(temp.dir, "nota.md", "v1", baseMetadata);
    await repository.write(temp.dir, "nota.md", "v2", { ...baseMetadata, tags: ["nuevo"] });
    const item = await repository.read(temp.dir, "nota.md");
    expect(item?.content).toBe("v2");
    expect(item?.metadata.tags).toEqual(["nuevo"]);
  });

  it("delete() elimina el fichero exacto", async () => {
    await repository.write(temp.dir, "nota.md", "v1", baseMetadata);
    await repository.delete(temp.dir, "nota.md");
    expect(await repository.exists(temp.dir, "nota.md")).toBe(false);
  });

  it("delete() lanza KNOWLEDGE_NOT_FOUND si el fichero no existe", async () => {
    await expect(repository.delete(temp.dir, "no-existe.md")).rejects.toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND })
    );
  });

  it("listIds() lista de forma recursiva y ordenada, ignorando extensiones no reconocidas", async () => {
    await repository.write(temp.dir, "b.md", "b", baseMetadata);
    await repository.write(temp.dir, "a.md", "a", baseMetadata);
    await repository.write(temp.dir, "guias/onboarding.md", "g", baseMetadata);
    await fs.writeFile(path.join(temp.dir, "imagen.png"), "binario", "utf-8");

    const ids = await repository.listIds(temp.dir);
    expect(ids).toEqual(["a.md", "b.md", "guias/onboarding.md"]);
  });

  it("listIds() devuelve [] si el directorio no existe", async () => {
    expect(await repository.listIds(path.join(temp.dir, "no-existe"))).toEqual([]);
  });

  it("buildTree() construye un árbol con carpetas y ficheros, marcando los reconocidos", async () => {
    await repository.write(temp.dir, "nota.md", "n", baseMetadata);
    await repository.write(temp.dir, "guias/onboarding.md", "g", baseMetadata);
    await fs.writeFile(path.join(temp.dir, "adjunto.pdf"), "binario", "utf-8");

    const tree = await repository.buildTree(temp.dir);
    const names = tree.map((node) => node.name).sort();
    expect(names).toEqual(["adjunto.pdf", "guias", "nota.md"]);

    const guias = tree.find((node) => node.name === "guias");
    expect(guias?.isDirectory).toBe(true);
    expect(guias?.children?.[0]?.relativePath).toBe("guias/onboarding.md");
    expect(guias?.children?.[0]?.recognized).toBe(true);

    const pdf = tree.find((node) => node.name === "adjunto.pdf");
    expect(pdf?.isDirectory).toBe(false);
    expect(pdf?.recognized).toBe(false);
  });

  it("buildTree() devuelve [] si el directorio no existe", async () => {
    expect(await repository.buildTree(path.join(temp.dir, "no-existe"))).toEqual([]);
  });

  it("statFile() devuelve fechas de respaldo del propio fichero", async () => {
    await repository.write(temp.dir, "nota.md", "n", baseMetadata);
    const stat = await repository.statFile(temp.dir, "nota.md");
    expect(typeof stat?.createdAt).toBe("string");
    expect(typeof stat?.updatedAt).toBe("string");
  });

  it("statFile() devuelve undefined si el fichero no existe", async () => {
    expect(await repository.statFile(temp.dir, "no-existe.md")).toBeUndefined();
  });

  it("rechaza ids que resuelven fuera del directorio de conocimiento", async () => {
    await expect(repository.write(temp.dir, "../fuera.md", "x", baseMetadata)).rejects.toThrowError(
      KnowledgeError
    );
  });
});
