import type { IModule, ModuleContext } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ImportManager } from "@dwm/import-manager";
import {
  isSafeDeliveryId,
  type Delivery,
  type DeliveryArchiveOptions,
  type DeliveryCompareResult,
  type DeliveryFilter,
  type DeliveryImportRequest,
  type DeliveryIntegrityResult,
  type DeliveryRecord,
  type DeliverySummary,
} from "./DeliveryTypes.js";
import { DeliveryValidator } from "./DeliveryValidator.js";
import { DeliveryRepository } from "./DeliveryRepository.js";
import { DeliveryHistory } from "./DeliveryHistory.js";
import { DeliveryImporter } from "./DeliveryImporter.js";
import { DeliveryErrorCode } from "./errors/DeliveryErrorCode.js";
import { createDeliveryError } from "./errors/DeliveryError.js";

export interface DeliveryManagerOptions {
  readonly importManager: ImportManager;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
}

type DeliveryEventPhase =
  "import.requested" | "import.completed" | "import.failed" | "archived" | "compared";

/**
 * Módulo 35 — Client Delivery Manager. Gestiona el histórico completo de
 * entregas que un cliente realiza para un proyecto (carpetas, ZIP,
 * backups, código fuente, recursos, documentación, bases de datos o
 * cualquier otro fichero), conservadas siempre bajo `ENTREGAS/` en la
 * raíz del proyecto, sin base de datos propia y sin sobrescribir nunca
 * una entrega ya recibida. Reutiliza íntegramente el motor de
 * `@dwm/import-manager` para la copia física; no lo duplica. Implementa
 * `IModule`, integrándose con el resto del Engine únicamente a través de
 * sus APIs públicas.
 */
export class DeliveryManager implements IModule {
  readonly id = "delivery-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly validator = new DeliveryValidator();
  private readonly repository: DeliveryRepository;
  private readonly history = new DeliveryHistory();
  private readonly importer: DeliveryImporter;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;

  constructor(options: DeliveryManagerOptions) {
    if (!options || !options.importManager) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST,
        message: "DeliveryManagerOptions.importManager es obligatorio.",
        origin: "request",
        recoverable: false,
      });
    }
    this.repository = new DeliveryRepository();
    this.importer = new DeliveryImporter(options.importManager, this.repository);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
  }

  /**
   * Importa una entrega nueva para un proyecto. Nunca sobrescribe: si ya
   * existe una carpeta para la fecha/etiqueta indicadas, falla. Si la
   * importación tiene éxito, cualquier entrega previamente `active` pasa
   * automáticamente a `superseded` (se conserva, nunca se archiva ni se
   * borra por este motivo).
   */
  async importDelivery(request: DeliveryImportRequest): Promise<Delivery> {
    this.validator.assertValidImportRequest(request);
    await this.notify("import.requested", request.projectId);

    // Se lee el histórico ANTES de importar: la entrega recién creada
    // también queda `active` en disco, así que si se leyera después
    // quedaría incluida entre las candidatas a degradar a `superseded`.
    const recordsBeforeImport = await this.readAllRecords(request.projectPath);

    let outcome;
    try {
      outcome = await this.importer.import(request);
    } catch (err) {
      await this.notify("import.failed", request.projectId);
      throw err;
    }

    if (!outcome.record) {
      // dryRun: nada que persistir ni promover.
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_REQUEST,
        message:
          "importDelivery() no admite dryRun; usa DeliveryImporter directamente para previsualizar.",
        origin: "request",
        recoverable: true,
      });
    }

    const toSupersede = this.history.supersedePreviousActive(recordsBeforeImport);
    for (const record of toSupersede) {
      await this.repository.writeMetadata(request.projectPath, record);
    }

    await this.notify("import.completed", request.projectId);
    return {
      ...outcome.record,
      path: this.repository.deliveryDir(request.projectPath, outcome.record.folderName),
    };
  }

  async listDeliveries(projectPath: string, filter?: DeliveryFilter): Promise<DeliverySummary[]> {
    const records = await this.readAllRecords(projectPath);
    const ordered = this.history.order(records);
    const active = this.history.findActive(records);
    return ordered
      .filter((r) => this.matchesFilter(r, filter))
      .map((r) => this.history.toSummary(r, active?.id));
  }

  async getDelivery(projectPath: string, id: string): Promise<Delivery | undefined> {
    if (!isSafeDeliveryId(id)) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_INVALID_ID,
        message: `Identificador de entrega inválido: "${id}".`,
        origin: "id",
        recoverable: false,
      });
    }
    const records = await this.readAllRecords(projectPath);
    const record = this.history.findById(records, id);
    if (!record) return undefined;
    return { ...record, path: this.repository.deliveryDir(projectPath, record.folderName) };
  }

  async getActiveDelivery(projectPath: string): Promise<Delivery | undefined> {
    const records = await this.readAllRecords(projectPath);
    const active = this.history.findActive(records);
    if (!active) return undefined;
    return { ...active, path: this.repository.deliveryDir(projectPath, active.folderName) };
  }

  async getHistory(projectPath: string): Promise<DeliverySummary[]> {
    return this.listDeliveries(projectPath);
  }

  async compareDeliveries(
    projectPath: string,
    idA: string,
    idB: string
  ): Promise<DeliveryCompareResult> {
    const records = await this.readAllRecords(projectPath);
    const a = this.requireRecord(records, idA);
    const b = this.requireRecord(records, idB);
    const result = this.history.compare(a, b);
    await this.notify("compared", projectPath);
    return result;
  }

  /** Archiva una entrega de forma explícita y terminal. Nunca promueve automáticamente otra entrega a `active` en su lugar. */
  async archiveDelivery(
    projectPath: string,
    id: string,
    options: DeliveryArchiveOptions = {}
  ): Promise<Delivery> {
    const records = await this.readAllRecords(projectPath);
    const record = this.requireRecord(records, id);
    const archived = this.history.archive(record, options.notes);
    await this.repository.writeMetadata(projectPath, archived);
    await this.notify("archived", projectPath);
    return { ...archived, path: this.repository.deliveryDir(projectPath, archived.folderName) };
  }

  /** Recalcula el hash actual de una entrega y lo compara con el almacenado en su sidecar, para detectar corrupción o manipulación posterior a la importación. */
  async verifyIntegrity(projectPath: string, id: string): Promise<DeliveryIntegrityResult> {
    const records = await this.readAllRecords(projectPath);
    const record = this.requireRecord(records, id);
    const deliveryDir = this.repository.deliveryDir(projectPath, record.folderName);
    const digest = await this.repository.computeDigest(deliveryDir);
    const issues: string[] = [];
    if (digest.hash !== record.hash) {
      issues.push(
        "El hash actual del contenido no coincide con el hash almacenado en la importación."
      );
    }
    if (digest.sizeBytes !== record.sizeBytes) {
      issues.push(
        "El tamaño actual del contenido no coincide con el tamaño almacenado en la importación."
      );
    }
    return {
      valid: issues.length === 0,
      storedHash: record.hash,
      currentHash: digest.hash,
      issues,
    };
  }

  async init(context: ModuleContext): Promise<void> {
    void context;
  }

  async dispose(): Promise<void> {
    // Sin recursos propios que liberar: toda la persistencia vive en los sidecars de cada entrega.
  }

  private async readAllRecords(projectPath: string): Promise<DeliveryRecord[]> {
    const folderNames = await this.repository.listFolderNames(projectPath);
    const records: DeliveryRecord[] = [];
    for (const folderName of folderNames) {
      const record = await this.repository.readMetadata(projectPath, folderName);
      if (record) records.push(record);
    }
    return records;
  }

  private requireRecord(records: readonly DeliveryRecord[], id: string): DeliveryRecord {
    const record = this.history.findById(records, id);
    if (!record) {
      throw createDeliveryError({
        code: DeliveryErrorCode.DELIVERY_NOT_FOUND,
        message: `No existe ninguna entrega con id "${id}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return record;
  }

  private matchesFilter(record: DeliveryRecord, filter?: DeliveryFilter): boolean {
    if (!filter) return true;
    if (filter.state !== undefined && record.state !== filter.state) return false;
    if (filter.type !== undefined && record.type !== filter.type) return false;
    if (filter.archived !== undefined && record.dwm.archived !== filter.archived) return false;
    return true;
  }

  private async notify(phase: DeliveryEventPhase, correlationId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`delivery.${phase}`, { correlationId }, { correlationId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(correlationId);
      if (phase === "import.failed") {
        await logger.error(`delivery:${phase} ${correlationId}`);
      } else {
        await logger.info(`delivery:${phase} ${correlationId}`);
      }
    }
  }
}
