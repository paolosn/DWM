import { isSafeRelativePath } from "@dwm/backup";
import type { ImportRequest, ImportScanResult } from "./ImportTypes.js";
import { isImportSourceType } from "./ImportTypes.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { createImportError } from "./errors/ImportError.js";

export interface ImportValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ImportValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ImportValidationIssue[];
}

/**
 * Valida la forma de una `ImportRequest` (sin tocar el sistema de
 * ficheros) y, tras la copia, compara el escaneo del origen con el de lo
 * efectivamente copiado para detectar cualquier discrepancia — número de
 * ficheros, número de carpetas, o ficheros faltantes — antes de dar la
 * importación por buena.
 */
export class ImportValidator {
  validateRequest(request: ImportRequest): ImportValidationResult {
    const issues: ImportValidationIssue[] = [];

    if (!request || typeof request !== "object") {
      return {
        valid: false,
        issues: [{ field: "request", message: "La solicitud debe ser un objeto." }],
      };
    }
    if (!isImportSourceType(request.sourceType)) {
      issues.push({
        field: "sourceType",
        message: 'sourceType debe ser "folder", "zip" o "dwm-workspace".',
      });
    }
    if (typeof request.sourcePath !== "string" || request.sourcePath.length === 0) {
      issues.push({
        field: "sourcePath",
        message: "sourcePath es obligatorio y debe ser una cadena no vacía.",
      });
    }
    if (
      request.destinationRelativePath !== undefined &&
      !isSafeRelativePath(request.destinationRelativePath)
    ) {
      issues.push({
        field: "destinationRelativePath",
        message: "destinationRelativePath debe ser una ruta relativa segura.",
      });
    }
    if (
      request.destinationPath !== undefined &&
      (typeof request.destinationPath !== "string" || request.destinationPath.length === 0)
    ) {
      issues.push({
        field: "destinationPath",
        message: "destinationPath debe ser una cadena no vacía si se indica.",
      });
    }
    if (request.excludePatterns !== undefined && !Array.isArray(request.excludePatterns)) {
      issues.push({
        field: "excludePatterns",
        message: "excludePatterns debe ser un array si se indica.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertValidRequest(request: ImportRequest): void {
    const result = this.validateRequest(request);
    if (!result.valid) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_INVALID_REQUEST,
        message: `Solicitud de importación inválida: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "request",
        recoverable: true,
      });
    }
  }

  /**
   * Compara el escaneo del origen con el de lo efectivamente copiado.
   * Cualquier discrepancia en el recuento de ficheros/carpetas, en la
   * firma agregada, o en un fichero individual faltante, se reporta como
   * issue: nunca se declara íntegra una copia parcial.
   */
  validateIntegrity(source: ImportScanResult, copied: ImportScanResult): ImportValidationResult {
    const issues: ImportValidationIssue[] = [];

    if (source.fileCount !== copied.fileCount) {
      issues.push({
        field: "fileCount",
        message: `Se esperaban ${source.fileCount} fichero(s) y se copiaron ${copied.fileCount}.`,
      });
    }
    if (source.directoryCount !== copied.directoryCount) {
      issues.push({
        field: "directoryCount",
        message: `Se esperaban ${source.directoryCount} carpeta(s) y se copiaron ${copied.directoryCount}.`,
      });
    }

    const copiedByPath = new Map(copied.entries.map((entry) => [entry.relativePath, entry]));
    for (const sourceEntry of source.entries) {
      const copiedEntry = copiedByPath.get(sourceEntry.relativePath);
      if (!copiedEntry) {
        issues.push({
          field: "entries",
          message: `Falta el fichero "${sourceEntry.relativePath}" en el destino.`,
        });
        continue;
      }
      if (copiedEntry.size !== sourceEntry.size) {
        issues.push({
          field: "entries",
          message: `El fichero "${sourceEntry.relativePath}" cambió de tamaño durante la copia (${sourceEntry.size} → ${copiedEntry.size}).`,
        });
      }
    }

    if (source.signature !== copied.signature && issues.length === 0) {
      issues.push({
        field: "signature",
        message: "La firma de integridad del destino no coincide con la del origen.",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  assertIntegrity(source: ImportScanResult, copied: ImportScanResult): void {
    const result = this.validateIntegrity(source, copied);
    if (!result.valid) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_INTEGRITY_MISMATCH,
        message: `La importación no es íntegra: ${result.issues.map((i) => `[${i.field}] ${i.message}`).join("; ")}`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
