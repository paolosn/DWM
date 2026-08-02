import type { DeliveryCompareResult, DeliveryRecord, DeliverySummary } from "./DeliveryTypes.js";
import { archiveDeliveryDwmMetadata, touchDeliveryDwmMetadata } from "./DeliveryMetadata.js";
import { DeliveryErrorCode } from "./errors/DeliveryErrorCode.js";
import { createDeliveryError } from "./errors/DeliveryError.js";

/**
 * Deriva y manipula el histórico ordenado de entregas de un proyecto a
 * partir de los `DeliveryRecord` ya leídos del disco por
 * `DeliveryRepository`. No accede al sistema de ficheros: opera
 * exclusivamente sobre los registros que recibe.
 */
export class DeliveryHistory {
  /** Ordena entregas ascendentemente por fecha de entrega (y, en empate, por fecha de importación). Nunca reordena en disco: es un orden lógico en memoria. */
  order(records: readonly DeliveryRecord[]): DeliveryRecord[] {
    return [...records].sort((a, b) => {
      const byDelivered = a.deliveredAt.localeCompare(b.deliveredAt);
      if (byDelivered !== 0) return byDelivered;
      return a.importedAt.localeCompare(b.importedAt);
    });
  }

  toSummary(record: DeliveryRecord, activeId?: string): DeliverySummary {
    const summary: DeliverySummary = {
      id: record.id,
      folderName: record.folderName,
      label: record.label,
      type: record.type,
      state: record.state,
      hash: record.hash,
      sizeBytes: record.sizeBytes,
      deliveredAt: record.deliveredAt,
      importedAt: record.importedAt,
      active: activeId !== undefined ? record.id === activeId : record.state === "active",
    };
    return record.version !== undefined ? { ...summary, version: record.version } : summary;
  }

  /** La entrega vigente: la más reciente cuyo estado sea `active`. `undefined` si ninguna lo está (p. ej. todas archivadas). */
  findActive(records: readonly DeliveryRecord[]): DeliveryRecord | undefined {
    const ordered = this.order(records).filter((r) => r.state === "active");
    return ordered[ordered.length - 1];
  }

  /** La última entrega recibida, sea cual sea su estado. */
  findLast(records: readonly DeliveryRecord[]): DeliveryRecord | undefined {
    const ordered = this.order(records);
    return ordered[ordered.length - 1];
  }

  findById(records: readonly DeliveryRecord[], id: string): DeliveryRecord | undefined {
    return records.find((r) => r.id === id);
  }

  /**
   * Calcula el conjunto de registros que resultan de añadir una entrega
   * nueva: cualquier entrega previamente `active` pasa a `superseded`
   * (nunca se archiva automáticamente, nunca se borra). Devuelve solo los
   * registros que cambiaron, para que la persistencia sea mínima.
   */
  supersedePreviousActive(records: readonly DeliveryRecord[]): DeliveryRecord[] {
    return records
      .filter((r) => r.state === "active")
      .map((r) => ({ ...r, state: "superseded" as const, dwm: touchDeliveryDwmMetadata(r.dwm) }));
  }

  /** Archiva una entrega concreta (decisión terminal y explícita). Lanza si ya estaba archivada. */
  archive(record: DeliveryRecord, notes?: string): DeliveryRecord {
    if (record.dwm.archived) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_ALREADY_ARCHIVED,
        message: `La entrega "${record.id}" ya está archivada.`,
        origin: "history",
        recoverable: true,
      });
    }
    return {
      ...record,
      state: "archived",
      dwm: archiveDeliveryDwmMetadata(record.dwm),
      ...(notes !== undefined ? { notes } : {}),
    };
  }

  /** Compara dos entregas del histórico por hash, tamaño y recuento de ficheros/carpetas. No decide cuál es "mejor": solo describe la diferencia objetiva. */
  compare(a: DeliveryRecord, b: DeliveryRecord): DeliveryCompareResult {
    return {
      a: this.toSummary(a),
      b: this.toSummary(b),
      hashMatch: a.hash === b.hash,
      sizeDeltaBytes: b.sizeBytes - a.sizeBytes,
      fileCountDelta: b.fileCount - a.fileCount,
      directoryCountDelta: b.directoryCount - a.directoryCount,
    };
  }
}
