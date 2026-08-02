import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeRegistry } from "../../src/KnowledgeRegistry.js";
import { KnowledgeError } from "../../src/errors/KnowledgeError.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";
import type { KnowledgeSummary } from "../../src/KnowledgeTypes.js";

function summary(overrides: Partial<KnowledgeSummary> = {}): KnowledgeSummary {
  return {
    id: "nota.md",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    relations: [],
    ...overrides,
  };
}

describe("KnowledgeRegistry", () => {
  let registry: KnowledgeRegistry;

  beforeEach(() => {
    registry = new KnowledgeRegistry();
  });

  it("set/get/has/delete", () => {
    registry.set(summary());
    expect(registry.has("nota.md")).toBe(true);
    expect(registry.get("nota.md")?.id).toBe("nota.md");
    registry.delete("nota.md");
    expect(registry.has("nota.md")).toBe(false);
    expect(registry.get("nota.md")).toBeUndefined();
  });

  it("require lanza KNOWLEDGE_NOT_FOUND si no está indexado", () => {
    expect(() => registry.require("no-existe.md")).toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND })
    );
    expect(() => registry.require("no-existe.md")).toThrowError(KnowledgeError);
  });

  it("replaceAll sustituye por completo el índice", () => {
    registry.set(summary({ id: "a.md" }));
    registry.replaceAll([summary({ id: "b.md" }), summary({ id: "c.md" })]);
    expect(registry.list().map((s) => s.id)).toEqual(["b.md", "c.md"]);
  });

  it("list devuelve los elementos ordenados por id", () => {
    registry.replaceAll([summary({ id: "z.md" }), summary({ id: "a.md" })]);
    expect(registry.list().map((s) => s.id)).toEqual(["a.md", "z.md"]);
  });

  describe("filter", () => {
    beforeEach(() => {
      registry.replaceAll([
        summary({ id: "a.md", archived: false, category: "Guías", tags: ["backend", "api"] }),
        summary({ id: "b.md", archived: true, category: "Guías", tags: ["frontend"] }),
        summary({ id: "c.md", archived: false, category: "Notas", tags: ["backend"] }),
      ]);
    });

    it("filtra por archived", () => {
      expect(registry.filter({ archived: true }).map((s) => s.id)).toEqual(["b.md"]);
    });

    it("filtra por category, sin distinguir mayúsculas", () => {
      expect(registry.filter({ category: "guías" }).map((s) => s.id)).toEqual(["a.md", "b.md"]);
    });

    it("filtra por tags exigiendo coincidencia de todas", () => {
      expect(registry.filter({ tags: ["backend"] }).map((s) => s.id)).toEqual(["a.md", "c.md"]);
      expect(registry.filter({ tags: ["backend", "api"] }).map((s) => s.id)).toEqual(["a.md"]);
    });

    it("combina varios criterios", () => {
      expect(registry.filter({ archived: false, category: "Notas" }).map((s) => s.id)).toEqual([
        "c.md",
      ]);
    });
  });

  describe("search", () => {
    beforeEach(() => {
      registry.replaceAll([
        summary({ id: "guias/onboarding.md", title: "Guía de onboarding", tags: ["rrhh"] }),
        summary({ id: "notas/otra.md", title: "Otra nota", tags: ["varios"] }),
      ]);
    });

    it("devuelve todo si la query está vacía", () => {
      expect(registry.search("  ").length).toBe(2);
    });

    it("busca por id, título y etiquetas sin distinguir mayúsculas", () => {
      expect(registry.search("onboarding").map((s) => s.id)).toEqual(["guias/onboarding.md"]);
      expect(registry.search("GUÍA").map((s) => s.id)).toEqual(["guias/onboarding.md"]);
      expect(registry.search("rrhh").map((s) => s.id)).toEqual(["guias/onboarding.md"]);
    });

    it("no devuelve nada si no hay coincidencias", () => {
      expect(registry.search("inexistente")).toEqual([]);
    });
  });

  it("listTags devuelve las etiquetas distintas ordenadas", () => {
    registry.replaceAll([
      summary({ id: "a.md", tags: ["b", "a"] }),
      summary({ id: "c.md", tags: ["a", "c"] }),
    ]);
    expect(registry.listTags()).toEqual(["a", "b", "c"]);
  });

  it("listCategories devuelve las categorías distintas ordenadas, ignorando ausentes", () => {
    registry.replaceAll([
      summary({ id: "a.md", category: "Z" }),
      summary({ id: "b.md" }),
      summary({ id: "c.md", category: "A" }),
    ]);
    expect(registry.listCategories()).toEqual(["A", "Z"]);
  });

  it("listRelatedBy calcula relaciones entrantes sin almacenamiento adicional", () => {
    registry.replaceAll([
      summary({ id: "a.md", relations: ["c.md"] }),
      summary({ id: "b.md", relations: ["c.md"] }),
      summary({ id: "c.md" }),
    ]);
    expect(registry.listRelatedBy("c.md")).toEqual(["a.md", "b.md"]);
    expect(registry.listRelatedBy("a.md")).toEqual([]);
  });

  describe("detección de duplicados", () => {
    it("findDuplicatesByName agrupa por nombre de fichero, sin distinguir mayúsculas", () => {
      registry.replaceAll([
        summary({ id: "guias/nota.md" }),
        summary({ id: "notas/NOTA.md" }),
        summary({ id: "unica.md" }),
      ]);
      const groups = registry.findDuplicatesByName();
      expect(groups).toHaveLength(1);
      expect(groups[0]?.ids).toEqual(["guias/nota.md", "notas/NOTA.md"]);
    });

    it("findDuplicatesByPath detecta colisiones de mayúsculas/minúsculas en la ruta", () => {
      registry.replaceAll([summary({ id: "Guias/Nota.md" }), summary({ id: "guias/nota.md" })]);
      const groups = registry.findDuplicatesByPath();
      expect(groups).toHaveLength(1);
      expect(groups[0]?.ids.slice().sort()).toEqual(["Guias/Nota.md", "guias/nota.md"].sort());
    });

    it("no reporta grupos cuando no hay duplicados", () => {
      registry.replaceAll([summary({ id: "a.md" }), summary({ id: "b.md" })]);
      expect(registry.findDuplicatesByName()).toEqual([]);
      expect(registry.findDuplicatesByPath()).toEqual([]);
    });
  });

  it("clear vacía el índice", () => {
    registry.set(summary());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
