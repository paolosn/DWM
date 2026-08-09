import { hasDwmBlock, splitFrontmatter } from "./RuleFrontmatter.js";
import { isSafeRuleId, isSafeExistingRuleId, RULE_DWM_FRONTMATTER_KEY } from "./RuleTypes.js";
import type { Rule } from "./RuleTypes.js";
import { RuleErrorCode } from "./errors/RuleErrorCode.js";
import { createRuleError } from "./errors/RuleError.js";

export interface RuleValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface RuleValidationResult {
  readonly valid: boolean;
  readonly issues: readonly RuleValidationIssue[];
}

/**
 * Valida la forma de los identificadores y el contenido de una regla
 * antes de que `RuleRepository` toque el sistema de ficheros. Nunca
 * asume que una regla es JSON: su fuente es siempre texto Markdown (con
 * o sin frontmatter propio del autor).
 */
export class RuleValidator {
  validateId(id: unknown): RuleValidationResult {
    if (!isSafeRuleId(id)) {
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
      throw createRuleError({
        code: RuleErrorCode.RULE_INVALID_ID,
        message: `Identificador de regla inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  /**
   * client-workflow "fix/library-edit-and-simple-ai" — usada solo para
   * leer/editar/eliminar una regla que ya existe (ver
   * `isSafeExistingRuleId`). `assertValidId` sigue aplicándose sin
   * cambios al crear/duplicar un id nuevo.
   */
  assertExistingId(id: unknown): void {
    if (!isSafeExistingRuleId(id)) {
      throw createRuleError({
        code: RuleErrorCode.RULE_INVALID_ID,
        message: `Identificador de regla inválido: "${String(id)}".`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  validateContent(content: unknown): RuleValidationResult {
    const issues: RuleValidationIssue[] = [];
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
        message: `"${RULE_DWM_FRONTMATTER_KEY}:" es una clave de frontmatter reservada para los metadatos gestionados por @dwm/rule-manager y no puede formar parte del contenido de la regla.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  assertValidContent(content: unknown): asserts content is string {
    const result = this.validateContent(content);
    if (!result.valid) {
      throw createRuleError({
        code: RuleErrorCode.RULE_VALIDATION_FAILED,
        message: `Contenido de regla inválido: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de una regla ya materializada (id + contenido + metadatos). */
  validateStructure(rule: Rule): RuleValidationResult {
    const issues: RuleValidationIssue[] = [...this.validateId(rule.id).issues];

    if (typeof rule.content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto Markdown." });
    }

    if (
      typeof rule.metadata.createdAt !== "string" ||
      Number.isNaN(Date.parse(rule.metadata.createdAt))
    ) {
      issues.push({
        field: "metadata.createdAt",
        message: "createdAt debe ser una fecha ISO válida.",
      });
    }
    if (
      typeof rule.metadata.updatedAt !== "string" ||
      Number.isNaN(Date.parse(rule.metadata.updatedAt))
    ) {
      issues.push({
        field: "metadata.updatedAt",
        message: "updatedAt debe ser una fecha ISO válida.",
      });
    }
    if (typeof rule.metadata.archived !== "boolean") {
      issues.push({ field: "metadata.archived", message: "archived debe ser un booleano." });
    }
    if (
      rule.metadata.archivedAt !== undefined &&
      (typeof rule.metadata.archivedAt !== "string" ||
        Number.isNaN(Date.parse(rule.metadata.archivedAt)))
    ) {
      issues.push({
        field: "metadata.archivedAt",
        message: "archivedAt debe ser una fecha ISO válida si se indica.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidStructure(rule: Rule): void {
    const result = this.validateStructure(rule);
    if (!result.valid) {
      throw createRuleError({
        code: RuleErrorCode.RULE_INVALID_STRUCTURE,
        message: `Estructura de regla inválida para "${rule.id}": ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
