import {
  isDeliverySourceType,
  isDeliveryType,
  isIsoDateString,
  isSafeDeliveryLabel,
  isSafeDeliveryNotes,
  isSafeDeliveryVersion,
  type DeliveryImportRequest,
  type DeliveryRecord,
} from "./DeliveryTypes.js";
import { DeliveryErrorCode } from "./errors/DeliveryErrorCode.js";
import { createDeliveryError } from "./errors/DeliveryError.js";

/**
 * Valida las solicitudes de entrada de `@dwm/delivery-manager` y la forma
 * estructural de un `DeliveryRecord` ya leído del disco. No conoce el
 * sistema de ficheros: solo forma y contenido.
 */
export class DeliveryValidator {
  assertValidImportRequest(request: DeliveryImportRequest): void {
    if (!request || typeof request !== "object") {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST,
        message: "DeliveryImportRequest es obligatorio y debe ser un objeto.",
        origin: "request",
        recoverable: false,
      });
    }
    if (typeof request.projectId !== "string" || request.projectId.length === 0) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST,
        message: "DeliveryImportRequest.projectId es obligatorio y debe ser una cadena no vacía.",
        origin: "project",
        recoverable: false,
      });
    }
    if (typeof request.projectPath !== "string" || request.projectPath.length === 0) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_PROJECT_PATH,
        message:
          "DeliveryImportRequest.projectPath es obligatorio y debe ser una ruta absoluta no vacía.",
        origin: "project",
        recoverable: false,
      });
    }
    if (!isDeliverySourceType(request.sourceType)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_SOURCE,
        message: `DeliveryImportRequest.sourceType inválido: "${String(request.sourceType)}".`,
        origin: "source",
        recoverable: false,
      });
    }
    if (typeof request.sourcePath !== "string" || request.sourcePath.length === 0) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_SOURCE,
        message: "DeliveryImportRequest.sourcePath es obligatorio y debe ser una cadena no vacía.",
        origin: "source",
        recoverable: false,
      });
    }
    if (!isSafeDeliveryLabel(request.label)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_LABEL,
        message: `DeliveryImportRequest.label inválido: "${String(request.label)}".`,
        origin: "label",
        recoverable: false,
      });
    }
    if (request.type !== undefined && !isDeliveryType(request.type)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_TYPE,
        message: `DeliveryImportRequest.type inválido: "${String(request.type)}".`,
        origin: "validation",
        recoverable: false,
      });
    }
    if (request.version !== undefined && !isSafeDeliveryVersion(request.version)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_VERSION,
        message: `DeliveryImportRequest.version inválida: "${String(request.version)}".`,
        origin: "validation",
        recoverable: false,
      });
    }
    if (request.notes !== undefined && !isSafeDeliveryNotes(request.notes)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_NOTES,
        message: "DeliveryImportRequest.notes supera la longitud máxima permitida.",
        origin: "validation",
        recoverable: false,
      });
    }
    if (request.deliveredAt !== undefined && !isIsoDateString(request.deliveredAt)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST,
        message: `DeliveryImportRequest.deliveredAt no es una fecha ISO 8601 válida: "${String(
          request.deliveredAt
        )}".`,
        origin: "validation",
        recoverable: false,
      });
    }
  }

  /** Valida la forma mínima de un `DeliveryRecord` ya parseado desde el sidecar de metadatos. Lanza si falta algún campo obligatorio o tiene un tipo incorrecto. */
  assertValidRecordStructure(
    record: unknown,
    sourcePath: string
  ): asserts record is DeliveryRecord {
    if (!record || typeof record !== "object") {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
        message: `El sidecar de metadatos en "${sourcePath}" no contiene un objeto JSON válido.`,
        origin: "validation",
        recoverable: true,
      });
    }
    const candidate = record as Partial<DeliveryRecord>;
    const requiredStringFields: (keyof DeliveryRecord)[] = [
      "id",
      "projectId",
      "folderName",
      "label",
      "type",
      "state",
      "origin",
      "hash",
      "deliveredAt",
      "importedAt",
    ];
    for (const field of requiredStringFields) {
      if (typeof candidate[field] !== "string" || (candidate[field] as string).length === 0) {
        throw createDeliveryError({
          code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
          message: `El sidecar de metadatos en "${sourcePath}" no tiene el campo obligatorio "${field}".`,
          origin: "validation",
          recoverable: true,
        });
      }
    }
    if (typeof candidate.sizeBytes !== "number" || typeof candidate.fileCount !== "number") {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
        message: `El sidecar de metadatos en "${sourcePath}" no tiene campos numéricos válidos.`,
        origin: "validation",
        recoverable: true,
      });
    }
    if (!candidate.dwm || typeof candidate.dwm !== "object") {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
        message: `El sidecar de metadatos en "${sourcePath}" no tiene el bloque "dwm" reservado.`,
        origin: "validation",
        recoverable: true,
      });
    }
  }
}
