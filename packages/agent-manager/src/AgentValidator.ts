import { AGENT_MANAGED_METADATA_KEY, isAgentData, isSafeAgentId } from "./AgentTypes.js";
import type { Agent, AgentData } from "./AgentTypes.js";
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
 * Valida la forma de los identificadores y de los datos de un agente,
 * antes de que `AgentRepository` toque el sistema de ficheros. No conoce
 * ninguna herramienta concreta (Kilo Code o similares): solo exige que un
 * agente sea un identificador seguro más un objeto JSON plano.
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

  validateData(data: unknown): AgentValidationResult {
    const issues: AgentValidationIssue[] = [];
    if (!isAgentData(data)) {
      issues.push({
        field: "data",
        message: "data debe ser un objeto JSON plano (no un array, ni null, ni un primitivo).",
      });
      return { valid: false, issues };
    }
    if (AGENT_MANAGED_METADATA_KEY in data) {
      issues.push({
        field: `data.${AGENT_MANAGED_METADATA_KEY}`,
        message: `"${AGENT_MANAGED_METADATA_KEY}" es una clave reservada para los metadatos gestionados por @dwm/agent-manager y no puede formar parte de los datos del agente.`,
      });
    }
    return { valid: issues.length === 0, issues };
  }

  assertValidData(data: unknown): asserts data is AgentData {
    const result = this.validateData(data);
    if (!result.valid) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_VALIDATION_FAILED,
        message: `Datos de agente inválidos: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  /** Validación estructural completa de un agente ya materializado (id + datos + metadatos). */
  validateStructure(agent: Agent): AgentValidationResult {
    const issues: AgentValidationIssue[] = [...this.validateId(agent.id).issues];
    const dataResult = this.validateData(agent.data);
    issues.push(...dataResult.issues);

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
