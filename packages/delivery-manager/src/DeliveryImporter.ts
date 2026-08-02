import { randomUUID } from "node:crypto";
import type { ImportManager, ImportResult } from "@dwm/import-manager";
import {
  deriveDeliveryFolderName,
  type DeliveryImportRequest,
  type DeliveryRecord,
  type DeliveryType,
} from "./DeliveryTypes.js";
import { createInitialDeliveryDwmMetadata } from "./DeliveryMetadata.js";
import { DeliveryRepository } from "./DeliveryRepository.js";
import { DeliveryErrorCode } from "./errors/DeliveryErrorCode.js";
import { DeliveryError, createDeliveryError } from "./errors/DeliveryError.js";

export interface DeliveryImportOutcome {
  /** Ausente cuando la solicitud es `dryRun: true`: nada se registra ni se escribe en disco. */
  readonly record?: DeliveryRecord;
  readonly importResult: ImportResult;
}

function defaultTypeFor(sourceType: DeliveryImportRequest["sourceType"]): DeliveryType {
  return sourceType === "zip" ? "zip" : "folder";
}

/**
 * Motor de importación de `@dwm/delivery-manager`: nunca copia nada por sí
 * mismo. Delega íntegramente la copia física (carpeta o ZIP), su
 * validación de integridad y su promoción atómica al destino final en el
 * motor ya existente de `@dwm/import-manager`, y se limita a calcular el
 * hash/tamaño resultante y a escribir el sidecar de metadatos de la
 * entrega una vez el motor confirma que la copia quedó íntegra. Nunca
 * sobrescribe una entrega existente: `overwriteExisting` es siempre
 * `false`.
 */
export class DeliveryImporter {
  constructor(
    private readonly importManager: ImportManager,
    private readonly repository: DeliveryRepository = new DeliveryRepository()
  ) {}

  async import(request: DeliveryImportRequest): Promise<DeliveryImportOutcome> {
    const deliveredAt = request.deliveredAt ?? new Date().toISOString();
    const folderName = deriveDeliveryFolderName(deliveredAt, request.label);
    const destinationPath = this.repository.deliveryDir(request.projectPath, folderName);

    if (!request.dryRun && (await this.repository.exists(request.projectPath, folderName))) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_ALREADY_EXISTS,
        message: `Ya existe una entrega en "${folderName}" para el proyecto "${request.projectId}"; nunca se sobrescribe una entrega. Usa una etiqueta o fecha distinta.`,
        origin: "repository",
        recoverable: true,
      });
    }

    let importResult: ImportResult;
    try {
      importResult = await this.importManager.importSource({
        sourceType: request.sourceType,
        sourcePath: request.sourcePath,
        destinationPath,
        overwriteExisting: false,
        dryRun: request.dryRun ?? false,
      });
    } catch (err) {
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_IMPORT_FAILED,
        origin: "import",
        recoverable: true,
        message: `Fallo al importar la entrega "${request.label}" desde "${request.sourcePath}".`,
      });
    }

    if (request.dryRun) {
      return { importResult };
    }

    const digest = await this.repository.computeDigest(destinationPath);
    const record: DeliveryRecord = {
      id: randomUUID(),
      projectId: request.projectId,
      folderName,
      label: request.label,
      type: request.type ?? defaultTypeFor(request.sourceType),
      state: "active",
      origin: request.sourcePath,
      hash: digest.hash,
      sizeBytes: digest.sizeBytes,
      fileCount: digest.fileCount,
      directoryCount: digest.directoryCount,
      deliveredAt,
      importedAt: new Date().toISOString(),
      dwm: createInitialDeliveryDwmMetadata(),
      ...(request.version !== undefined ? { version: request.version } : {}),
      ...(request.notes !== undefined ? { notes: request.notes } : {}),
    };

    await this.repository.writeMetadata(request.projectPath, record);
    return { record, importResult };
  }
}
