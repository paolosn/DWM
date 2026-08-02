import { describe, it, expect } from "vitest";
import {
  extractKnowledgeTitle,
  hasDwmBlock,
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  serializeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "../../src/KnowledgeFrontmatter.js";
import type { KnowledgeMetadata } from "../../src/KnowledgeTypes.js";

const baseMetadata: KnowledgeMetadata = {
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  tags: ["backend", "api"],
  relations: ["otra.md"],
};

describe("splitFrontmatter", () => {
  it("devuelve body completo cuando no hay frontmatter", () => {
    const result = splitFrontmatter("# Título\ncontenido\n");
    expect(result.frontmatter).toBeUndefined();
    expect(result.malformed).toBe(false);
    expect(result.body).toBe("# Título\ncontenido\n");
  });

  it("separa frontmatter y body cuando ambos delimitadores están presentes", () => {
    const raw = '---\ntitle: "Hola"\n---\n# Cuerpo\n';
    const result = splitFrontmatter(raw);
    expect(result.malformed).toBe(false);
    expect(result.frontmatter).toBe('title: "Hola"');
    expect(result.body).toBe("# Cuerpo\n");
  });

  it("detecta frontmatter mal formado (sin cierre)", () => {
    const result = splitFrontmatter("---\ntitle: Hola\nsin cierre");
    expect(result.malformed).toBe(true);
  });
});

describe("joinFrontmatter", () => {
  it("reconstruye el fichero completo", () => {
    expect(joinFrontmatter("title: Hola", "cuerpo\n")).toBe("---\ntitle: Hola\n---\ncuerpo\n");
  });

  it("devuelve solo el body si no hay frontmatter", () => {
    expect(joinFrontmatter(undefined, "cuerpo\n")).toBe("cuerpo\n");
  });
});

describe("bloque dwm:", () => {
  it("serializa y parsea de vuelta metadatos completos, incluidas etiquetas y relaciones", () => {
    const block = serializeDwmBlock(baseMetadata);
    expect(hasDwmBlock(block)).toBe(true);
    const parsed = parseDwmMetadata(block);
    expect(parsed?.archived).toBe(false);
    expect(parsed?.createdAt).toBe(baseMetadata.createdAt);
    expect(parsed?.updatedAt).toBe(baseMetadata.updatedAt);
    expect(parsed?.tags).toEqual(["backend", "api"]);
    expect(parsed?.relations).toEqual(["otra.md"]);
  });

  it("serializa archivedAt únicamente cuando el elemento está archivado", () => {
    const archived: KnowledgeMetadata = {
      ...baseMetadata,
      archived: true,
      archivedAt: "2026-01-03T00:00:00.000Z",
    };
    const block = serializeDwmBlock(archived);
    expect(block).toContain('archivedAt: "2026-01-03T00:00:00.000Z"');
    const parsed = parseDwmMetadata(block);
    expect(parsed?.archivedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("serializa category únicamente cuando está presente", () => {
    const withCategory: KnowledgeMetadata = { ...baseMetadata, category: "Guías" };
    const block = serializeDwmBlock(withCategory);
    expect(block).toContain('category: "Guías"');
    expect(parseDwmMetadata(block)?.category).toBe("Guías");

    const withoutCategory = serializeDwmBlock(baseMetadata);
    expect(withoutCategory).not.toContain("category:");
  });

  it("serializa listas vacías de tags/relations como []", () => {
    const empty: KnowledgeMetadata = { ...baseMetadata, tags: [], relations: [] };
    const block = serializeDwmBlock(empty);
    expect(block).toContain("tags: []");
    expect(block).toContain("relations: []");
    const parsed = parseDwmMetadata(block);
    expect(parsed?.tags).toEqual([]);
    expect(parsed?.relations).toEqual([]);
  });

  it("hasDwmBlock/removeDwmBlock detectan y retiran el bloque sin tocar el resto del frontmatter", () => {
    const frontmatter = `title: "Hola"\n${serializeDwmBlock(baseMetadata)}\nauthor: "Paolo"`;
    expect(hasDwmBlock(frontmatter)).toBe(true);
    const stripped = removeDwmBlock(frontmatter);
    expect(stripped).not.toContain("dwm:");
    expect(stripped).toContain('title: "Hola"');
    expect(stripped).toContain('author: "Paolo"');
  });

  it("removeDwmBlock devuelve undefined si tras retirar el bloque no queda nada", () => {
    const stripped = removeDwmBlock(serializeDwmBlock(baseMetadata));
    expect(stripped).toBeUndefined();
  });

  it("removeDwmBlock devuelve undefined si el frontmatter es undefined", () => {
    expect(removeDwmBlock(undefined)).toBeUndefined();
  });

  it("hasDwmBlock es falso si no hay bloque dwm:", () => {
    expect(hasDwmBlock("title: Hola")).toBe(false);
    expect(hasDwmBlock(undefined)).toBe(false);
  });

  it("upsertDwmBlock sustituye un bloque previo sin duplicarlo", () => {
    const first = upsertDwmBlock("title: Hola", baseMetadata);
    const updated: KnowledgeMetadata = { ...baseMetadata, tags: ["nuevo"] };
    const second = upsertDwmBlock(first, updated);
    expect((second.match(/dwm:/g) ?? []).length).toBe(1);
    expect(parseDwmMetadata(second)?.tags).toEqual(["nuevo"]);
    expect(second).toContain("title: Hola");
  });

  it("parseDwmMetadata devuelve undefined si no hay bloque dwm:", () => {
    expect(parseDwmMetadata("title: Hola")).toBeUndefined();
    expect(parseDwmMetadata(undefined)).toBeUndefined();
  });
});

describe("extractKnowledgeTitle", () => {
  it("prioriza el título del frontmatter propio del autor", () => {
    const content = '---\ntitle: "Guía de onboarding"\n---\n# Otro título\n';
    expect(extractKnowledgeTitle(content)).toBe("Guía de onboarding");
  });

  it("usa el primer encabezado del cuerpo si no hay title: en el frontmatter", () => {
    expect(extractKnowledgeTitle("# Encabezado\ntexto\n")).toBe("Encabezado");
  });

  it("devuelve undefined si no hay ni frontmatter title ni encabezado", () => {
    expect(extractKnowledgeTitle("solo texto plano\n")).toBeUndefined();
  });

  it("cae al primer encabezado del texto crudo cuando el frontmatter está mal formado", () => {
    expect(extractKnowledgeTitle("---\nsin cierre\n# Encabezado\n")).toBe("Encabezado");
  });
});
