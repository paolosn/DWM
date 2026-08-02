import type { KnowledgeRegistry } from "./KnowledgeRegistry.js";
import { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
import { createKnowledgeError } from "./errors/KnowledgeError.js";

/** Vista combinada de las relaciones de un elemento: las que él mismo declara (`outgoing`) y las que otros elementos declaran hacia él (`incoming`), calculada sin almacenamiento adicional. */
export interface KnowledgeRelationView {
  readonly id: string;
  readonly outgoing: readonly string[];
  readonly incoming: readonly string[];
}

/**
 * Responsable exclusivo de las relaciones simples y dirigidas entre
 * elementos de conocimiento: un elemento guarda, en su propio
 * frontmatter (`dwm.relations`), los ids de otros elementos con los que
 * se relaciona. No implementa un grafo genérico ni consultas
 * transitivas: únicamente valida que una relación sea coherente
 * (ambos elementos existen, ninguna relación consigo mismo) y calcula,
 * a partir del índice en memoria de `KnowledgeRegistry`, la vista
 * combinada de relaciones salientes y entrantes de un elemento.
 */
export class KnowledgeRelations {
  /** Valida que `id` pueda declarar una relación hacia `relatedId` en `registry`, sin mutar nada. */
  assertCanRelate(registry: KnowledgeRegistry, id: string, relatedId: string): void {
    if (id === relatedId) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_SELF_RELATION,
        message: `El elemento de conocimiento "${id}" no puede relacionarse consigo mismo.`,
        origin: "relation",
        recoverable: true,
      });
    }
    registry.require(id);
    if (!registry.has(relatedId)) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
        message: `No existe ningún elemento de conocimiento indexado con id "${relatedId}" con el que relacionar "${id}".`,
        origin: "relation",
        recoverable: true,
      });
    }
  }

  /** Valida que `id` tenga actualmente una relación saliente hacia `relatedId` en `registry`. */
  assertHasRelation(registry: KnowledgeRegistry, id: string, relatedId: string): void {
    const summary = registry.require(id);
    if (!summary.relations.includes(relatedId)) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_RELATION_NOT_FOUND,
        message: `El elemento de conocimiento "${id}" no tiene ninguna relación hacia "${relatedId}".`,
        origin: "relation",
        recoverable: true,
      });
    }
  }

  /** Vista combinada de relaciones salientes (declaradas por `id`) y entrantes (declaradas por otros elementos hacia `id`). */
  view(registry: KnowledgeRegistry, id: string): KnowledgeRelationView {
    const summary = registry.require(id);
    return { id, outgoing: summary.relations, incoming: registry.listRelatedBy(id) };
  }
}
