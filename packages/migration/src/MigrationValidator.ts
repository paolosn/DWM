import { isSafeRelativePath } from "@dwm/backup";
import type { MigrationExportRequest, MigrationImportRequest } from "./MigrationRequest.js";
import { MigrationErrorCode } from "./errors/MigrationErrorCode.js";
import { createMigrationError } from "./errors/MigrationError.js";

export interface MigrationValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface MigrationValidationResult {
  readonly valid: boolean;
  readonly issues: readonly MigrationValidationIssue[];
}

const VALID_TYPES = new Set(["full", "selective", "incremental"]);
const VALID_CONFLICT_STRATEGIES = new Set(["fail", "skip", "overwrite"]);

/**
 * Valida la forma de las solicitudes de exportación e importación de
 * migración, sin consultar todavía ningún catálogo ni aplicar ningún
 * cambio. Devuelve un diagnóstico estructurado en lugar de un simple
 * booleano.
 */
export class MigrationValidator {
  validateExportRequest(request: MigrationExportRequest): MigrationValidationResult {
    const issues: MigrationValidationIssue[] = [];

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
        message: "Una migración incremental requiere baseBackupId.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  validateImportRequest(request: MigrationImportRequest): MigrationValidationResult {
    const issues: MigrationValidationIssue[] = [];

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
    if (
      request.conflictStrategy !== undefined &&
      !VALID_CONFLICT_STRATEGIES.has(request.conflictStrategy)
    ) {
      issues.push({
        field: "conflictStrategy",
        message: `conflictStrategy "${request.conflictStrategy}" no es válido.`,
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidExportRequest(request: MigrationExportRequest): void {
    const result = this.validateExportRequest(request);
    if (!result.valid) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
        message: `Solicitud de exportación inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }

  assertValidImportRequest(request: MigrationImportRequest): void {
    const result = this.validateImportRequest(request);
    if (!result.valid) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
        message: `Solicitud de importación inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }
}
