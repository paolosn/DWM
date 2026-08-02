import { splitFrontmatter, hasDwmBlock } from "./KnowledgeFrontmatter.js";
import {
  isSafeKnowledgeId,
  isSafeKnowledgeTag,
  isSafeKnowledgeCategory,
  KNOWLEDGE_DWM_FRONTMATTER_KEY,
} from "./KnowledgeTypes.js";
import type { KnowledgeItem } from "./KnowledgeTypes.js";
import { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
import { createKnowledgeError } from "./errors/KnowledgeError.js";

export interface KnowledgeValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface KnowledgeValidationResult {
  readonly valid: boolean;
  readonly issues: readonly KnowledgeValidationIssue[];
}

/**
 * Valida la forma de los identificadores, el contenido, las etiquetas y
 * la categoría de un elemento de conocimiento, antes de que
 * `KnowledgeRepository` toque el sistema de ficheros. Nunca asume que
 * un elemento es JSON: su fuente es siempre texto (con o sin
 * frontmatter propio del autor).
 */
export class KnowledgeValidator {
  validateId(id: unknown): KnowledgeValidationResult {
    if (!isSafeKnowledgeId(id)) {
      return {
        valid: false,
        issues: [
          {
            field: "id",
            message:
              'id debe ser una ruta relativa segura dentro del recurso de conocimiento (sin ".." ni rutas absolutas), con una extensión reconocida (.md, .markdown, .mdx, .txt).',
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidId(id: unknown): void {
    const result = this.validateId(id);
    if (!result.valid) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_ID,
        message: `Identificador de conocimiento inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  validateContent(content: unknown): KnowledgeValidationResult {
    const issues: KnowledgeValidationIssue[] = [];
    if (typeof content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto." });
      return { valid: false, issues };
    }
    const { frontmatter, malformed } = splitFrontmatter(content);
    if (malformed) {
      issues.push({
        field: "content",
        message:
          'El contenido empieza con un delimitador de frontmatter ("---") pero nunca lo cierra.',
      });
    } else if (hasDwmBlock(frontmatter)) {
      issues.push({
        field: "content",
        message: `"${KNOWLEDGE_DWM_FRONTMATTER_KEY}:" es una clave de frontmatter reservada para los metadatos gestionados por @dwm/knowledge-manager y no puede formar parte del contenido del elemento.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  assertValidContent(content: unknown): asserts content is string {
    const result = this.validateContent(content);
    if (!result.valid) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_VALIDATION_FAILED,
        message: `Contenido de conocimiento inválido: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateTags(tags: readonly unknown[]): KnowledgeValidationResult {
    const issues: KnowledgeValidationIssue[] = [];
    tags.forEach((tag, index) => {
      if (!isSafeKnowledgeTag(tag)) {
        issues.push({
          field: `tags[${index}]`,
          message:
            "cada etiqueta debe ser texto no vacío, de hasta 64 caracteres, sin comas ni saltos de línea.",
        });
      }
    });
    return { valid: issues.length === 0, issues };
  }

  assertValidTags(tags: readonly unknown[]): asserts tags is readonly string[] {
    const result = this.validateTags(tags);
    if (!result.valid) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_TAG,
        message: `Etiquetas inválidas: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateCategory(category: unknown): KnowledgeValidationResult {
    if (category === undefined || category === null) return { valid: true, issues: [] };
    if (!isSafeKnowledgeCategory(category)) {
      return {
        valid: false,
        issues: [
          {
            field: "category",
            message:
              "category debe ser texto no vacío, de hasta 128 caracteres, sin comas ni saltos de línea.",
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidCategory(category: unknown): void {
    const result = this.validateCategory(category);
    if (!result.valid) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_CATEGORY,
        message: `Categoría inválida: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de un elemento ya materializado (id + contenido + metadatos). */
  validateStructure(item: KnowledgeItem): KnowledgeValidationResult {
    const issues: KnowledgeValidationIssue[] = [
      ...this.validateId(item.id).issues,
      ...this.validateTags(item.metadata.tags).issues,
      ...this.validateCategory(item.metadata.category).issues,
    ];

    if (typeof item.content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto." });
    }

    if (
      typeof item.metadata.createdAt !== "string" ||
      Number.isNaN(Date.parse(item.metadata.createdAt))
    ) {
      issues.push({
        field: "metadata.createdAt",
        message: "createdAt debe ser una fecha ISO válida.",
      });
    }
    if (
      typeof item.metadata.updatedAt !== "string" ||
      Number.isNaN(Date.parse(item.metadata.updatedAt))
    ) {
      issues.push({
        field: "metadata.updatedAt",
        message: "updatedAt debe ser una fecha ISO válida.",
      });
    }
    if (typeof item.metadata.archived !== "boolean") {
      issues.push({ field: "metadata.archived", message: "archived debe ser un booleano." });
    }
    if (
      item.metadata.archivedAt !== undefined &&
      (typeof item.metadata.archivedAt !== "string" ||
        Number.isNaN(Date.parse(item.metadata.archivedAt)))
    ) {
      issues.push({
        field: "metadata.archivedAt",
        message: "archivedAt debe ser una fecha ISO válida si se indica.",
      });
    }
    if (!Array.isArray(item.metadata.relations)) {
      issues.push({ field: "metadata.relations", message: "relations debe ser un array de ids." });
    } else if (item.metadata.relations.includes(item.id)) {
      issues.push({
        field: "metadata.relations",
        message: "un elemento no puede tener una relación consigo mismo.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidStructure(item: KnowledgeItem): void {
    const result = this.validateStructure(item);
    if (!result.valid) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_STRUCTURE,
        message: `Estructura de conocimiento inválida para "${item.id}": ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
