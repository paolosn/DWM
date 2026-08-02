import { describe, it, expect } from "vitest";
import { KnowledgeValidator } from "../../src/KnowledgeValidator.js";
import { KnowledgeError } from "../../src/errors/KnowledgeError.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";
import type { KnowledgeItem } from "../../src/KnowledgeTypes.js";

const validator = new KnowledgeValidator();

function makeItem(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id: "nota.md",
    content: "# Nota\n",
    metadata: {
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: ["backend"],
      relations: [],
    },
    ...overrides,
  };
}

describe("validateId / assertValidId", () => {
  it("acepta ids válidos", () => {
    expect(validator.validateId("nota.md").valid).toBe(true);
    expect(() => validator.assertValidId("guias/nota.md")).not.toThrow();
  });

  it("rechaza ids inválidos y lanza KNOWLEDGE_INVALID_ID", () => {
    expect(validator.validateId("../fuera.md").valid).toBe(false);
    expect(() => validator.assertValidId("../fuera.md")).toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_ID })
    );
  });
});

describe("validateContent / assertValidContent", () => {
  it("acepta texto plano y con frontmatter propio del autor", () => {
    expect(validator.validateContent("# Nota\n").valid).toBe(true);
    expect(validator.validateContent('---\ntitle: "X"\n---\ncuerpo').valid).toBe(true);
  });

  it("rechaza contenido que no es texto", () => {
    expect(validator.validateContent(42).valid).toBe(false);
  });

  it("rechaza frontmatter mal formado", () => {
    const result = validator.validateContent("---\nsin cierre");
    expect(result.valid).toBe(false);
  });

  it("rechaza contenido que reutiliza la clave reservada dwm:", () => {
    const result = validator.validateContent("---\ndwm:\n  archived: true\n---\ncuerpo");
    expect(result.valid).toBe(false);
    expect(() => validator.assertValidContent("---\ndwm:\n  archived: true\n---\ncuerpo")).toThrow(
      KnowledgeError
    );
  });
});

describe("validateTags / assertValidTags", () => {
  it("acepta listas de etiquetas válidas, incluida la vacía", () => {
    expect(validator.validateTags([]).valid).toBe(true);
    expect(validator.validateTags(["backend", "api"]).valid).toBe(true);
  });

  it("rechaza etiquetas inválidas y lanza KNOWLEDGE_INVALID_TAG", () => {
    expect(validator.validateTags(["", "ok"]).valid).toBe(false);
    expect(() => validator.assertValidTags(["a,b"])).toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_TAG })
    );
  });
});

describe("validateCategory / assertValidCategory", () => {
  it("acepta categoría ausente, undefined o texto válido", () => {
    expect(validator.validateCategory(undefined).valid).toBe(true);
    expect(validator.validateCategory(null).valid).toBe(true);
    expect(validator.validateCategory("Guías").valid).toBe(true);
  });

  it("rechaza categorías inválidas y lanza KNOWLEDGE_INVALID_CATEGORY", () => {
    expect(validator.validateCategory("").valid).toBe(false);
    expect(() => validator.assertValidCategory("a,b")).toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_CATEGORY })
    );
  });
});

describe("validateStructure / assertValidStructure", () => {
  it("acepta un elemento bien formado", () => {
    expect(validator.validateStructure(makeItem()).valid).toBe(true);
    expect(() => validator.assertValidStructure(makeItem())).not.toThrow();
  });

  it("acumula issues por cada campo inválido", () => {
    const item = makeItem({
      id: "../fuera.md",
      content: 42 as unknown as string,
      metadata: {
        archived: false,
        createdAt: "no-es-fecha",
        updatedAt: "no-es-fecha",
        tags: ["ok"],
        relations: [],
      },
    });
    const result = validator.validateStructure(item);
    expect(result.valid).toBe(false);
    const fields = result.issues.map((issue) => issue.field);
    expect(fields).toContain("id");
    expect(fields).toContain("content");
    expect(fields).toContain("metadata.createdAt");
    expect(fields).toContain("metadata.updatedAt");
  });

  it("rechaza archivedAt con formato inválido", () => {
    const item = makeItem({
      metadata: {
        archived: true,
        archivedAt: "no-es-fecha",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tags: [],
        relations: [],
      },
    });
    expect(validator.validateStructure(item).valid).toBe(false);
  });

  it("rechaza un elemento que se relaciona consigo mismo", () => {
    const item = makeItem({
      metadata: {
        archived: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        tags: [],
        relations: ["nota.md"],
      },
    });
    const result = validator.validateStructure(item);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "metadata.relations")).toBe(true);
  });

  it("lanza KNOWLEDGE_INVALID_STRUCTURE cuando la estructura no es válida", () => {
    const item = makeItem({ id: "../fuera.md" });
    expect(() => validator.assertValidStructure(item)).toThrowError(
      expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_INVALID_STRUCTURE })
    );
  });
});
