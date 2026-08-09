import { splitFrontmatter, hasDwmBlock } from "./SkillFrontmatter.js";
import {
  isSafeSkillId,
  isSafeExistingSkillId,
  isSafeSkillRelativePath,
  SKILL_DWM_FRONTMATTER_KEY,
} from "./SkillTypes.js";
import type { Skill } from "./SkillTypes.js";
import { SkillErrorCode } from "./errors/SkillErrorCode.js";
import { createSkillError } from "./errors/SkillError.js";

export interface SkillValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface SkillValidationResult {
  readonly valid: boolean;
  readonly issues: readonly SkillValidationIssue[];
}

/**
 * Valida la forma de los identificadores, el contenido de `SKILL.md` y
 * las rutas de archivos auxiliares, antes de que `SkillRepository` toque
 * el sistema de ficheros. Nunca asume que una skill es JSON: su fuente
 * es siempre texto Markdown (con o sin frontmatter propio del autor).
 */
export class SkillValidator {
  validateId(id: unknown): SkillValidationResult {
    if (!isSafeSkillId(id)) {
      return {
        valid: false,
        issues: [
          {
            field: "id",
            message:
              "id debe ser una cadena no vacía, de hasta 128 caracteres, que empiece por un carácter alfanumérico y solo contenga letras, números, puntos, guiones y guiones bajos.",
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidId(id: unknown): void {
    const result = this.validateId(id);
    if (!result.valid) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_INVALID_ID,
        message: `Identificador de skill inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  /**
   * client-workflow "fix/library-edit-and-simple-ai" — usada solo para
   * leer/editar/eliminar una skill que ya existe (ver
   * `isSafeExistingSkillId`). `assertValidId` sigue aplicándose sin
   * cambios al crear/duplicar un id nuevo.
   */
  assertExistingId(id: unknown): void {
    if (!isSafeExistingSkillId(id)) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_INVALID_ID,
        message: `Identificador de skill inválido: "${String(id)}".`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  validateContent(content: unknown): SkillValidationResult {
    const issues: SkillValidationIssue[] = [];
    if (typeof content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto Markdown." });
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
        message: `"${SKILL_DWM_FRONTMATTER_KEY}:" es una clave de frontmatter reservada para los metadatos gestionados por @dwm/skill-manager y no puede formar parte del contenido de la skill.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  assertValidContent(content: unknown): asserts content is string {
    const result = this.validateContent(content);
    if (!result.valid) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_VALIDATION_FAILED,
        message: `Contenido de skill inválido: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  validateAuxRelativePath(relativePath: unknown): SkillValidationResult {
    if (!isSafeSkillRelativePath(relativePath)) {
      return {
        valid: false,
        issues: [
          {
            field: "relativePath",
            message:
              'relativePath debe ser una ruta relativa segura dentro de la carpeta de la skill, sin ".." ni rutas absolutas.',
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  assertValidAuxRelativePath(relativePath: unknown): asserts relativePath is string {
    const result = this.validateAuxRelativePath(relativePath);
    if (!result.valid) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_UNSAFE_PATH,
        message: `Ruta de archivo auxiliar insegura: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "path",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de una skill ya materializada (id + contenido + metadatos). */
  validateStructure(skill: Skill): SkillValidationResult {
    const issues: SkillValidationIssue[] = [...this.validateId(skill.id).issues];

    if (typeof skill.content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto Markdown." });
    }

    if (
      typeof skill.metadata.createdAt !== "string" ||
      Number.isNaN(Date.parse(skill.metadata.createdAt))
    ) {
      issues.push({
        field: "metadata.createdAt",
        message: "createdAt debe ser una fecha ISO válida.",
      });
    }
    if (
      typeof skill.metadata.updatedAt !== "string" ||
      Number.isNaN(Date.parse(skill.metadata.updatedAt))
    ) {
      issues.push({
        field: "metadata.updatedAt",
        message: "updatedAt debe ser una fecha ISO válida.",
      });
    }
    if (typeof skill.metadata.archived !== "boolean") {
      issues.push({ field: "metadata.archived", message: "archived debe ser un booleano." });
    }
    if (
      skill.metadata.archivedAt !== undefined &&
      (typeof skill.metadata.archivedAt !== "string" ||
        Number.isNaN(Date.parse(skill.metadata.archivedAt)))
    ) {
      issues.push({
        field: "metadata.archivedAt",
        message: "archivedAt debe ser una fecha ISO válida si se indica.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidStructure(skill: Skill): void {
    const result = this.validateStructure(skill);
    if (!result.valid) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_INVALID_STRUCTURE,
        message: `Estructura de skill inválida para "${skill.id}": ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
