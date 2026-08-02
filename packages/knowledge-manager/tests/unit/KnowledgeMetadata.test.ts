import { describe, it, expect } from "vitest";
import { KnowledgeMetadataService } from "../../src/KnowledgeMetadata.js";
import type { KnowledgeMetadata } from "../../src/KnowledgeTypes.js";

describe("KnowledgeMetadataService", () => {
  const service = new KnowledgeMetadataService();

  describe("createInitial", () => {
    it("crea metadatos por defecto sin archivar, sin tags ni categoría", () => {
      const metadata = service.createInitial();
      expect(metadata.archived).toBe(false);
      expect(metadata.tags).toEqual([]);
      expect(metadata.relations).toEqual([]);
      expect(metadata.category).toBeUndefined();
      expect(metadata.createdAt).toBe(metadata.updatedAt);
    });

    it("normaliza las etiquetas indicadas y añade la categoría si se indica", () => {
      const metadata = service.createInitial({ tags: [" Backend ", "backend"], category: "Guías" });
      expect(metadata.tags).toEqual(["backend"]);
      expect(metadata.category).toBe("Guías");
    });

    it("omite category cuando se indica vacía", () => {
      const metadata = service.createInitial({ category: "" });
      expect(metadata.category).toBeUndefined();
    });
  });

  describe("withTouchedTimestamp", () => {
    it("actualiza únicamente updatedAt, preservando el resto", async () => {
      const initial = service.createInitial({ tags: ["a"], category: "Cat" });
      await new Promise((resolve) => setTimeout(resolve, 2));
      const touched = service.withTouchedTimestamp(initial);
      expect(touched.createdAt).toBe(initial.createdAt);
      expect(touched.tags).toEqual(initial.tags);
      expect(touched.category).toBe(initial.category);
      expect(new Date(touched.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(initial.updatedAt).getTime()
      );
    });
  });

  describe("withMetadataUpdate", () => {
    const base: KnowledgeMetadata = {
      archived: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      tags: ["a", "b"],
      relations: [],
      category: "Original",
    };

    it("actualiza solo las etiquetas cuando category no se indica", () => {
      const result = service.withMetadataUpdate(base, { tags: ["nuevo"] });
      expect(result.tags).toEqual(["nuevo"]);
      expect(result.category).toBe("Original");
    });

    it("actualiza solo la categoría cuando tags no se indica", () => {
      const result = service.withMetadataUpdate(base, { category: "Nueva" });
      expect(result.tags).toEqual(base.tags);
      expect(result.category).toBe("Nueva");
    });

    it("limpia la categoría cuando se indica null", () => {
      const result = service.withMetadataUpdate(base, { category: null });
      expect(result.category).toBeUndefined();
    });

    it("no toca nada si el update está vacío, salvo updatedAt", () => {
      const result = service.withMetadataUpdate(base, {});
      expect(result.tags).toEqual(base.tags);
      expect(result.category).toBe(base.category);
    });
  });

  describe("withArchived / withRestored", () => {
    it("archiva estableciendo archived y archivedAt", () => {
      const initial = service.createInitial();
      const archived = service.withArchived(initial);
      expect(archived.archived).toBe(true);
      expect(typeof archived.archivedAt).toBe("string");
    });

    it("restaura retirando archived y archivedAt", () => {
      const initial = service.createInitial();
      const archived = service.withArchived(initial);
      const restored = service.withRestored(archived);
      expect(restored.archived).toBe(false);
      expect(restored.archivedAt).toBeUndefined();
    });
  });

  describe("withRelationAdded / withRelationRemoved", () => {
    it("añade una relación nueva de forma idempotente", () => {
      const initial = service.createInitial();
      const withRelation = service.withRelationAdded(initial, "otra.md");
      expect(withRelation.relations).toEqual(["otra.md"]);
      const again = service.withRelationAdded(withRelation, "otra.md");
      expect(again.relations).toEqual(["otra.md"]);
      expect(again).toBe(withRelation);
    });

    it("retira una relación existente de forma idempotente", () => {
      const initial = service.createInitial();
      const withRelation = service.withRelationAdded(initial, "otra.md");
      const removed = service.withRelationRemoved(withRelation, "otra.md");
      expect(removed.relations).toEqual([]);
      const again = service.withRelationRemoved(removed, "otra.md");
      expect(again).toBe(removed);
    });
  });

  describe("fromFallback", () => {
    it("construye metadatos por defecto a partir de fechas de respaldo", () => {
      const stat = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
      const metadata = service.fromFallback(stat);
      expect(metadata.archived).toBe(false);
      expect(metadata.createdAt).toBe(stat.createdAt);
      expect(metadata.updatedAt).toBe(stat.updatedAt);
      expect(metadata.tags).toEqual([]);
      expect(metadata.relations).toEqual([]);
    });
  });
});
