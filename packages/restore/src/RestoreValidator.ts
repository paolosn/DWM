import { isSafeRelativePath } from "@dwm/backup";
import type { RestoreRequest } from "./RestoreRequest.js";
import { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
import { createRestoreError } from "./errors/RestoreError.js";

export interface RestoreValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface RestoreValidationResult {
  readonly valid: boolean;
  readonly issues: readonly RestoreValidationIssue[];
}

/**
 * Valida la forma de una `RestoreRequest`, sin consultar todavía el
 * catálogo de backups ni aplicar ningún cambio. Devuelve un diagnóstico
 * estructurado en lugar de un simple booleano.
 */
export class RestoreValidator {
  validateRequest(request: RestoreRequest): RestoreValidationResult {
    const issues: RestoreValidationIssue[] = [];

    if (!request || typeof request !== "object") {
      return {
        valid: false,
        issues: [{ field: "request", message: "La solicitud debe ser un objeto." }],
      };
    }
    if (typeof request.backupId !== "string" || request.backupId.length === 0) {
      issues.push({
        field: "backupId",
        message: "backupId es obligatorio y debe ser una cadena no vacía.",
      });
    }
    if (request.resourceTypes !== undefined && !Array.isArray(request.resourceTypes)) {
      issues.push({
        field: "resourceTypes",
        message: "resourceTypes debe ser un array si se indica.",
      });
    }
    if (request.targetOverride !== undefined) {
      if (
        typeof request.targetOverride.providerId !== "string" ||
        request.targetOverride.providerId.length === 0
      ) {
        issues.push({
          field: "targetOverride",
          message: "targetOverride.providerId es obligatorio.",
        });
      }
      if (!isSafeRelativePath(request.targetOverride.path)) {
        issues.push({
          field: "targetOverride",
          message: "targetOverride.path debe ser una ruta relativa segura.",
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidRequest(request: RestoreRequest): void {
    const result = this.validateRequest(request);
    if (!result.valid) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
        message: `Solicitud de restauración inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }
}
