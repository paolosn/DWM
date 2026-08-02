import type { VerificationRequest } from "./VerificationRequest.js";
import { isValidVerificationCategory } from "./VerificationCategory.js";
import { VerificationErrorCode } from "./errors/VerificationErrorCode.js";
import { createVerificationError } from "./errors/VerificationError.js";

export interface VerificationValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface VerificationValidationResult {
  readonly valid: boolean;
  readonly issues: readonly VerificationValidationIssue[];
}

/**
 * Valida la forma de una `VerificationRequest`, sin ejecutar todavía
 * ninguna comprobación. Devuelve un diagnóstico estructurado en lugar de
 * un simple booleano.
 */
export class VerificationValidator {
  validateRequest(request: VerificationRequest): VerificationValidationResult {
    const issues: VerificationValidationIssue[] = [];

    if (request === null || typeof request !== "object") {
      return {
        valid: false,
        issues: [{ field: "request", message: "La solicitud debe ser un objeto." }],
      };
    }
    if (request.categories !== undefined) {
      if (!Array.isArray(request.categories) || request.categories.length === 0) {
        issues.push({
          field: "categories",
          message: "categories debe ser un array no vacío si se indica.",
        });
      } else {
        for (const category of request.categories) {
          if (!isValidVerificationCategory(category)) {
            issues.push({
              field: "categories",
              message: `La categoría "${String(category)}" no es válida.`,
            });
          }
        }
      }
    }
    if (request.dryRun !== undefined && typeof request.dryRun !== "boolean") {
      issues.push({ field: "dryRun", message: "dryRun debe ser un booleano si se indica." });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidRequest(request: VerificationRequest): void {
    const result = this.validateRequest(request);
    if (!result.valid) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST,
        message: `Solicitud de verificación inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }
}
