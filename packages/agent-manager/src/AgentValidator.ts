import { hasDwmBlock, splitFrontmatter } from "./AgentFrontmatter.js";
import { isSafeAgentId, isSafeExistingAgentId, AGENT_DWM_FRONTMATTER_KEY } from "./AgentTypes.js";
import type { Agent } from "./AgentTypes.js";
import { AgentErrorCode } from "./errors/AgentErrorCode.js";
import { createAgentError } from "./errors/AgentError.js";

export interface AgentValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface AgentValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AgentValidationIssue[];
}

/**
 * Valida la forma de los identificadores y del contenido de un agente,
 * antes de que `AgentRepository` toque el sistema de ficheros. Nunca
 * asume que un agente es JSON: su fuente es siempre texto Markdown (con
 * o sin frontmatter propio del autor, compatible con Kilo Code).
 */
export class AgentValidator {
  validateId(id: unknown): AgentValidationResult {
    if (!isSafeAgentId(id)) {
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
      throw createAgentError({
        code: AgentErrorCode.AGENT_INVALID_ID,
        message: `Identificador de agente inválido: ${result.issues.map((i) => i.message).join("; ")}`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  /**
   * client-workflow "fix/library-edit-and-simple-ai" — usada solo para
   * leer/editar/eliminar un agente que ya existe (ver
   * `isSafeExistingAgentId`). No exige el patrón estricto de
   * `assertValidId`, que sigue aplicándose sin cambios al crear/
   * duplicar un id nuevo.
   */
  assertExistingId(id: unknown): void {
    if (!isSafeExistingAgentId(id)) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_INVALID_ID,
        message: `Identificador de agente inválido: "${String(id)}".`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  validateContent(content: unknown): AgentValidationResult {
    const issues: AgentValidationIssue[] = [];
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
        message: `"${AGENT_DWM_FRONTMATTER_KEY}:" es una clave de frontmatter reservada para los metadatos gestionados por @dwm/agent-manager y no puede formar parte del contenido del agente.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  assertValidContent(content: unknown): asserts content is string {
    const result = this.validateContent(content);
    if (!result.valid) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_VALIDATION_FAILED,
        message: `Contenido de agente inválido: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de un agente ya materializado (id + contenido + metadatos). */
  validateStructure(agent: Agent): AgentValidationResult {
    const issues: AgentValidationIssue[] = [...this.validateId(agent.id).issues];

    if (typeof agent.content !== "string") {
      issues.push({ field: "content", message: "content debe ser una cadena de texto Markdown." });
    }

    if (
      typeof agent.metadata.createdAt !== "string" ||
      Number.isNaN(Date.parse(agent.metadata.createdAt))
    ) {
      issues.push({
        field: "metadata.createdAt",
        message: "createdAt debe ser una fecha ISO válida.",
      });
    }
    if (
      typeof agent.metadata.updatedAt !== "string" ||
      Number.isNaN(Date.parse(agent.metadata.updatedAt))
    ) {
      issues.push({
        field: "metadata.updatedAt",
        message: "updatedAt debe ser una fecha ISO válida.",
      });
    }
    if (typeof agent.metadata.archived !== "boolean") {
      issues.push({ field: "metadata.archived", message: "archived debe ser un booleano." });
    }
    if (
      agent.metadata.archivedAt !== undefined &&
      (typeof agent.metadata.archivedAt !== "string" ||
        Number.isNaN(Date.parse(agent.metadata.archivedAt)))
    ) {
      issues.push({
        field: "metadata.archivedAt",
        message: "archivedAt debe ser una fecha ISO válida si se indica.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidStructure(agent: Agent): void {
    const result = this.validateStructure(agent);
    if (!result.valid) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_INVALID_STRUCTURE,
        message: `Estructura de agente inválida para "${agent.id}": ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
