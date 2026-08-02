import {
  normalizeTags,
  type KnowledgeMetadata,
  type KnowledgeMetadataUpdate,
} from "./KnowledgeTypes.js";

/**
 * Responsable exclusivo de construir y mutar objetos `KnowledgeMetadata`
 * de forma consistente (normalización de etiquetas, marcas de tiempo,
 * ciclo de vida de archivado). No toca el sistema de ficheros ni el
 * frontmatter serializado: eso es responsabilidad de
 * `KnowledgeFrontmatter`/`KnowledgeRepository`. Existe como módulo
 * propio para que "consultar metadatos" y "mutar metadatos" tengan una
 * única fuente de verdad, separada de la orquestación de
 * `KnowledgeManager` y de la validación de `KnowledgeValidator`.
 */
export class KnowledgeMetadataService {
  /** Metadatos iniciales para un elemento recién creado. */
  createInitial(overrides: KnowledgeMetadataUpdate = {}): KnowledgeMetadata {
    const now = new Date().toISOString();
    return {
      archived: false,
      createdAt: now,
      updatedAt: now,
      tags: normalizeTags(overrides.tags ?? []),
      relations: [],
      ...(overrides.category ? { category: overrides.category } : {}),
    };
  }

  /** Metadatos resultantes de editar el contenido de un elemento existente: conserva todo salvo `updatedAt`. */
  withTouchedTimestamp(metadata: KnowledgeMetadata): KnowledgeMetadata {
    return { ...metadata, updatedAt: new Date().toISOString() };
  }

  /** Aplica cambios parciales de etiquetas/categoría, sin tocar el resto de campos salvo `updatedAt`. `category: null` limpia la categoría existente. */
  withMetadataUpdate(
    metadata: KnowledgeMetadata,
    update: KnowledgeMetadataUpdate
  ): KnowledgeMetadata {
    const { category: _existingCategory, ...withoutCategory } = metadata;
    const tags = update.tags !== undefined ? normalizeTags(update.tags) : metadata.tags;
    const nextCategory = update.category !== undefined ? update.category : metadata.category;

    return {
      ...withoutCategory,
      tags,
      updatedAt: new Date().toISOString(),
      ...(nextCategory ? { category: nextCategory } : {}),
    };
  }

  withArchived(metadata: KnowledgeMetadata): KnowledgeMetadata {
    const now = new Date().toISOString();
    return { ...metadata, archived: true, archivedAt: now, updatedAt: now };
  }

  withRestored(metadata: KnowledgeMetadata): KnowledgeMetadata {
    const { archivedAt: _archivedAt, ...rest } = metadata;
    return { ...rest, archived: false, updatedAt: new Date().toISOString() };
  }

  /** Metadatos con `relatedId` añadido a `relations` (idempotente, sin duplicados). */
  withRelationAdded(metadata: KnowledgeMetadata, relatedId: string): KnowledgeMetadata {
    if (metadata.relations.includes(relatedId)) return metadata;
    return {
      ...metadata,
      relations: [...metadata.relations, relatedId],
      updatedAt: new Date().toISOString(),
    };
  }

  /** Metadatos con `relatedId` retirado de `relations` (idempotente). */
  withRelationRemoved(metadata: KnowledgeMetadata, relatedId: string): KnowledgeMetadata {
    if (!metadata.relations.includes(relatedId)) return metadata;
    return {
      ...metadata,
      relations: metadata.relations.filter((id) => id !== relatedId),
      updatedAt: new Date().toISOString(),
    };
  }

  /** Metadatos reconstruidos para un elemento cuyo fichero fue creado/modificado fuera de este módulo (fallback usando fechas del propio fichero). */
  fromFallback(stat: { createdAt: string; updatedAt: string }): KnowledgeMetadata {
    return {
      archived: false,
      createdAt: stat.createdAt,
      updatedAt: stat.updatedAt,
      tags: [],
      relations: [],
    };
  }
}
