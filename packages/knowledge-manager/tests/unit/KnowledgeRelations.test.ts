import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeRegistry } from "../../src/KnowledgeRegistry.js";
import { KnowledgeRelations } from "../../src/KnowledgeRelations.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";
import type { KnowledgeSummary } from "../../src/KnowledgeTypes.js";

function summary(overrides: Partial<KnowledgeSummary> = {}): KnowledgeSummary {
  return {
    id: "a.md",
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    tags: [],
    relations: [],
    ...overrides,
  };
}

describe("KnowledgeRelations", () => {
  let registry: KnowledgeRegistry;
  const relations = new KnowledgeRelations();

  beforeEach(() => {
    registry = new KnowledgeRegistry();
    registry.replaceAll([
      summary({ id: "a.md", relations: ["b.md"] }),
      summary({ id: "b.md" }),
      summary({ id: "c.md" }),
    ]);
  });

  describe("assertCanRelate", () => {
    it("no lanza cuando ambos elementos existen y son distintos", () => {
      expect(() => relations.assertCanRelate(registry, "a.md", "c.md")).not.toThrow();
    });

    it("lanza KNOWLEDGE_SELF_RELATION si el origen y el destino coinciden", () => {
      expect(() => relations.assertCanRelate(registry, "a.md", "a.md")).toThrowError(
        expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_SELF_RELATION })
      );
    });

    it("lanza KNOWLEDGE_NOT_FOUND si el origen no está indexado", () => {
      expect(() => relations.assertCanRelate(registry, "no-existe.md", "a.md")).toThrowError(
        expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND })
      );
    });

    it("lanza KNOWLEDGE_NOT_FOUND si el destino no está indexado", () => {
      expect(() => relations.assertCanRelate(registry, "a.md", "no-existe.md")).toThrowError(
        expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND })
      );
    });
  });

  describe("assertHasRelation", () => {
    it("no lanza cuando la relación existe", () => {
      expect(() => relations.assertHasRelation(registry, "a.md", "b.md")).not.toThrow();
    });

    it("lanza KNOWLEDGE_RELATION_NOT_FOUND cuando no existe la relación", () => {
      expect(() => relations.assertHasRelation(registry, "a.md", "c.md")).toThrowError(
        expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_RELATION_NOT_FOUND })
      );
    });
  });

  describe("view", () => {
    it("combina relaciones salientes y entrantes", () => {
      expect(relations.view(registry, "a.md")).toEqual({
        id: "a.md",
        outgoing: ["b.md"],
        incoming: [],
      });
      expect(relations.view(registry, "b.md")).toEqual({
        id: "b.md",
        outgoing: [],
        incoming: ["a.md"],
      });
    });

    it("lanza KNOWLEDGE_NOT_FOUND si el id no está indexado", () => {
      expect(() => relations.view(registry, "no-existe.md")).toThrowError(
        expect.objectContaining({ code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND })
      );
    });
  });
});
