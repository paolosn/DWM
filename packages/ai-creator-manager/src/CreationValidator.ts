import { isSafeAgentId } from "@dwm/agent-manager";
import { isSafeSkillId } from "@dwm/skill-manager";
import { isSafeRuleId } from "@dwm/rule-manager";
import { isSafeKnowledgeId } from "@dwm/knowledge-manager";
import { isSafeClientId, isSafeClientSlug, isSafeClientName } from "@dwm/client-manager";
import {
  isCreationKind,
  type CreationRequest,
  type ClientCreationPayload,
  type ProjectCreationPayload,
  type TemplateCreationPayload,
} from "./CreationTypes.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

export interface CreationValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface CreationValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CreationValidationIssue[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Valida la forma de una `CreationRequest` antes de que `CreationPipeline`
 * resuelva plantillas, consulte proveedores o toque cualquier manager de
 * destino. Reutiliza los propios validadores de identificador de cada
 * manager (`isSafeAgentId`, `isSafeSkillId`, etc.) en vez de reinventar
 * sus reglas, para no divergir nunca de lo que el manager de destino
 * aceptará realmente.
 */
export class CreationValidator {
  validateRequest(request: CreationRequest): CreationValidationResult {
    if (!request || typeof request !== "object") {
      return {
        valid: false,
        issues: [{ field: "request", message: "la petición es obligatoria." }],
      };
    }
    if (!isCreationKind(request.kind)) {
      return {
        valid: false,
        issues: [
          { field: "kind", message: `kind debe ser uno de los tipos de recurso soportados.` },
        ],
      };
    }
    switch (request.kind) {
      case "agent":
        return this.validateOptionalId(request.payload.id, isSafeAgentId);
      case "skill":
        return this.validateOptionalId(request.payload.id, isSafeSkillId);
      case "rule":
        return this.validateOptionalId(request.payload.id, isSafeRuleId);
      case "knowledge":
        return this.validateOptionalId(request.payload.id, isSafeKnowledgeId);
      case "client":
        return this.validateClientPayload(request.payload);
      case "project":
        return this.validateProjectPayload(request.payload);
      case "template":
        return this.validateTemplatePayload(request.payload);
    }
  }

  assertValidRequest(request: CreationRequest): void {
    const result = this.validateRequest(request);
    if (!result.valid) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_VALIDATION_FAILED,
        message: `Petición de creación inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  private validateOptionalId(
    id: string | undefined,
    isValid: (value: unknown) => boolean
  ): CreationValidationResult {
    if (id === undefined) return { valid: true, issues: [] };
    if (!isValid(id)) {
      return {
        valid: false,
        issues: [
          {
            field: "id",
            message: `"${id}" no es un identificador válido para este tipo de recurso.`,
          },
        ],
      };
    }
    return { valid: true, issues: [] };
  }

  private validateClientPayload(payload: ClientCreationPayload): CreationValidationResult {
    const issues: CreationValidationIssue[] = [];
    if (!isSafeClientName(payload.name)) {
      issues.push({ field: "name", message: "name es obligatorio y debe ser texto no vacío." });
    }
    if (payload.id !== undefined && !isSafeClientId(payload.id)) {
      issues.push({
        field: "id",
        message: `"${payload.id}" no es un identificador de cliente válido.`,
      });
    }
    if (payload.slug !== undefined && !isSafeClientSlug(payload.slug)) {
      issues.push({ field: "slug", message: `"${payload.slug}" no es un slug de cliente válido.` });
    }
    return { valid: issues.length === 0, issues };
  }

  private validateProjectPayload(payload: ProjectCreationPayload): CreationValidationResult {
    const issues: CreationValidationIssue[] = [];
    if (!isNonEmptyString(payload.name)) {
      issues.push({ field: "name", message: "name es obligatorio y debe ser texto no vacío." });
    }
    if (typeof payload.description !== "string") {
      issues.push({ field: "description", message: "description es obligatoria." });
    }
    if (!isNonEmptyString(payload.projectPath)) {
      issues.push({
        field: "projectPath",
        message: "projectPath es obligatorio y debe ser texto no vacío.",
      });
    }
    if (!isNonEmptyString(payload.profileId)) {
      issues.push({
        field: "profileId",
        message: "profileId es obligatorio y debe ser texto no vacío.",
      });
    }
    return { valid: issues.length === 0, issues };
  }

  private validateTemplatePayload(payload: TemplateCreationPayload): CreationValidationResult {
    const issues: CreationValidationIssue[] = [];
    if (!isNonEmptyString(payload.id)) {
      issues.push({ field: "id", message: "id es obligatorio y debe ser texto no vacío." });
    }
    if (!isCreationKind(payload.targetKind)) {
      issues.push({
        field: "targetKind",
        message: 'targetKind debe ser un tipo de recurso soportado distinto de "template".',
      });
    }
    if (payload.content === undefined && payload.data === undefined) {
      issues.push({ field: "content", message: "una plantilla necesita content o data." });
    }
    return { valid: issues.length === 0, issues };
  }

  /** Genera ids alternativos deterministas a partir de `base` (`base-2`, `base-3`, ...), para ofrecerlos tras un conflicto. */
  suggestAlternativeIds(base: string, count = 3): string[] {
    const suggestions: string[] = [];
    for (let i = 2; i <= count + 1; i += 1) {
      suggestions.push(`${base}-${i}`);
    }
    return suggestions;
  }
}
