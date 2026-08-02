import {
  knowledgeBaseName,
  type KnowledgeDuplicateGroup,
  type KnowledgeFilter,
  type KnowledgeSummary,
} from "./KnowledgeTypes.js";
import { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
import { createKnowledgeError } from "./errors/KnowledgeError.js";

/**
 * Mantiene en memoria un índice —nunca una base de datos, nunca
 * persistido— de los elementos de conocimiento reales del Workspace,
 * reconstruido por `KnowledgeManager` a partir de `KnowledgeRepository`.
 * Existe únicamente para poder listar, filtrar, buscar, navegar por
 * etiquetas/categorías y detectar duplicados sin releer y reparsear
 * todos los ficheros en cada consulta dentro de una misma operación.
 */
export class KnowledgeRegistry {
  private readonly summaries = new Map<string, KnowledgeSummary>();

  set(summary: KnowledgeSummary): void {
    this.summaries.set(summary.id, summary);
  }

  get(id: string): KnowledgeSummary | undefined {
    return this.summaries.get(id);
  }

  has(id: string): boolean {
    return this.summaries.has(id);
  }

  require(id: string): KnowledgeSummary {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
        message: `No hay ningún elemento de conocimiento indexado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return summary;
  }

  delete(id: string): void {
    this.summaries.delete(id);
  }

  /** Sustituye por completo el contenido del índice (usado tras reconstruirlo desde disco). */
  replaceAll(summaries: readonly KnowledgeSummary[]): void {
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.id, summary);
  }

  list(): KnowledgeSummary[] {
    return [...this.summaries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  filter(criteria: KnowledgeFilter): KnowledgeSummary[] {
    const wantedTags = (criteria.tags ?? []).map((tag) => tag.trim().toLowerCase());
    return this.list().filter((summary) => {
      if (criteria.archived !== undefined && summary.archived !== criteria.archived) return false;
      if (
        criteria.category !== undefined &&
        (summary.category ?? "").toLowerCase() !== criteria.category.toLowerCase()
      ) {
        return false;
      }
      if (wantedTags.length > 0 && !wantedTags.every((tag) => summary.tags.includes(tag))) {
        return false;
      }
      return true;
    });
  }

  /** Búsqueda de texto libre, sin distinguir mayúsculas, sobre el id, el título y las etiquetas. */
  search(query: string): KnowledgeSummary[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return this.list();
    return this.list().filter((summary) => {
      if (summary.id.toLowerCase().includes(needle)) return true;
      if (summary.title?.toLowerCase().includes(needle)) return true;
      return summary.tags.some((tag) => tag.includes(needle));
    });
  }

  /** Todas las etiquetas distintas presentes en el índice, ordenadas. */
  listTags(): string[] {
    const tags = new Set<string>();
    for (const summary of this.summaries.values()) {
      for (const tag of summary.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  /** Todas las categorías distintas presentes en el índice, ordenadas. */
  listCategories(): string[] {
    const categories = new Set<string>();
    for (const summary of this.summaries.values()) {
      if (summary.category) categories.add(summary.category);
    }
    return [...categories].sort();
  }

  /** Ids de los elementos que declaran una relación saliente hacia `id` (búsqueda inversa, sin almacenamiento adicional). */
  listRelatedBy(id: string): string[] {
    return this.list()
      .filter((summary) => summary.relations.includes(id))
      .map((summary) => summary.id);
  }

  /** Agrupa los elementos indexados por nombre de fichero (último segmento de su id), sin distinguir mayúsculas; solo devuelve grupos con más de un elemento. */
  findDuplicatesByName(): KnowledgeDuplicateGroup[] {
    const groups = new Map<string, string[]>();
    for (const summary of this.list()) {
      const key = knowledgeBaseName(summary.id).toLowerCase();
      const ids = groups.get(key) ?? [];
      ids.push(summary.id);
      groups.set(key, ids);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, ids: ids.sort() }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  /** Agrupa los elementos indexados por ruta normalizada (minúsculas), detectando colisiones de mayúsculas/minúsculas entre ids distintos; solo devuelve grupos con más de un elemento. */
  findDuplicatesByPath(): KnowledgeDuplicateGroup[] {
    const groups = new Map<string, string[]>();
    for (const summary of this.list()) {
      const key = summary.id.toLowerCase();
      const ids = groups.get(key) ?? [];
      ids.push(summary.id);
      groups.set(key, ids);
    }
    return [...groups.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key, ids: ids.sort() }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  clear(): void {
    this.summaries.clear();
  }
}
