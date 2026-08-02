import type { BackupRequest } from "./BackupRequest.js";
import { isSafeRelativePath } from "./BackupResource.js";
import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { createBackupError } from "./errors/BackupError.js";

export interface BackupValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface BackupValidationResult {
  readonly valid: boolean;
  readonly issues: readonly BackupValidationIssue[];
}

const VALID_TYPES = new Set(["full", "selective", "incremental"]);

/**
 * Valida la forma y coherencia declarativa de una `BackupRequest`, sin
 * resolver ni copiar ningún recurso todavía. Devuelve un diagnóstico
 * estructurado en lugar de un simple booleano.
 */
export class BackupValidator {
  validateRequest(request: BackupRequest): BackupValidationResult {
    const issues: BackupValidationIssue[] = [];

    if (!request || typeof request !== "object") {
      return {
        valid: false,
        issues: [{ field: "request", message: "La solicitud debe ser un objeto." }],
      };
    }
    if (!VALID_TYPES.has(request.type)) {
      issues.push({ field: "type", message: `El tipo "${String(request.type)}" no es válido.` });
    }
    if (!Array.isArray(request.resources) || request.resources.length === 0) {
      issues.push({ field: "resources", message: "resources debe ser un array no vacío." });
    } else {
      for (const resource of request.resources) {
        if (
          !resource ||
          typeof resource.resourceId !== "string" ||
          resource.resourceId.length === 0
        ) {
          issues.push({
            field: "resources",
            message: "Cada recurso debe declarar un resourceId no vacío.",
          });
        }
      }
    }
    if (request.excludedPaths !== undefined) {
      if (!Array.isArray(request.excludedPaths)) {
        issues.push({ field: "excludedPaths", message: "excludedPaths debe ser un array." });
      } else {
        for (const excluded of request.excludedPaths) {
          if (!isSafeRelativePath(excluded)) {
            issues.push({
              field: "excludedPaths",
              message: `La ruta de exclusión "${excluded}" no es segura.`,
            });
          }
        }
      }
    }
    if (
      !request.target ||
      typeof request.target.providerId !== "string" ||
      request.target.providerId.length === 0
    ) {
      issues.push({ field: "target", message: "target.providerId es obligatorio." });
    }
    if (!request.target || !isSafeRelativePath(request.target.path)) {
      issues.push({ field: "target", message: "target.path debe ser una ruta relativa segura." });
    }
    if (
      request.type === "incremental" &&
      (!request.baseBackupId || request.baseBackupId.length === 0)
    ) {
      issues.push({
        field: "baseBackupId",
        message: "Un backup incremental requiere baseBackupId.",
      });
    }
    if (request.type !== "incremental" && request.baseBackupId !== undefined) {
      issues.push({
        field: "baseBackupId",
        message: "baseBackupId solo es válido para backups incrementales.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidRequest(request: BackupRequest): void {
    const result = this.validateRequest(request);
    if (!result.valid) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INVALID_REQUEST,
        message: `Solicitud de backup inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }
}
