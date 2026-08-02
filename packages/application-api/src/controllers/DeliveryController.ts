import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalString, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { isDeliverySourceType, isDeliveryState, isDeliveryType } from "@dwm/delivery-manager";
import type {
  Delivery,
  DeliveryCompareResult,
  DeliveryFilter,
  DeliveryIntegrityResult,
  DeliverySourceType,
  DeliveryState,
  DeliverySummary,
  DeliveryType,
} from "@dwm/delivery-manager";
import type { ProjectManager } from "@dwm/project";

/** `Delivery` sin `path`: la ubicación física interna de DWM nunca se expone fuera de la Application API. */
export type DeliveryDTO = Omit<Delivery, "path">;

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "deliveries.list": {
      payload: {
        projectId: string;
        state?: DeliveryState;
        type?: DeliveryType;
        archived?: boolean;
      };
      result: DeliverySummary[];
    };
    "deliveries.get": {
      payload: { projectId: string; id: string };
      result: DeliveryDTO | undefined;
    };
    "deliveries.get-active": {
      payload: { projectId: string };
      result: DeliveryDTO | undefined;
    };
    "deliveries.history": {
      payload: { projectId: string };
      result: DeliverySummary[];
    };
    "deliveries.import": {
      payload: {
        projectId: string;
        sourceType: DeliverySourceType;
        sourcePath: string;
        label: string;
        type?: DeliveryType;
        version?: string;
        notes?: string;
        deliveredAt?: string;
      };
      result: DeliveryDTO;
    };
    "deliveries.compare": {
      payload: { projectId: string; idA: string; idB: string };
      result: DeliveryCompareResult;
    };
    "deliveries.verify-integrity": {
      payload: { projectId: string; id: string };
      result: DeliveryIntegrityResult;
    };
    "deliveries.archive": {
      payload: { projectId: string; id: string; notes?: string };
      result: DeliveryDTO;
    };
  }
}

/** Nunca se expone `Delivery.path` (ubicación interna en disco) fuera de la Application API. */
function toDeliveryDTO(delivery: Delivery): DeliveryDTO {
  const { path: _path, ...dto } = delivery;
  return dto;
}

/**
 * Módulo 35 — controlador del recurso `deliveries`, delega exclusivamente
 * en `@dwm/delivery-manager`. `@dwm/delivery-manager` identifica una
 * entrega por `projectPath` (ruta absoluta), no por `projectId`: este
 * controlador es el único responsable de resolver `projectId` →
 * `projectPath` a través de `@dwm/project` (ya conectado en
 * `ApplicationContext`) antes de delegar — nunca duplica lógica de
 * importación, hash, histórico ni archivado, que siguen viviendo
 * exclusivamente en `DeliveryManager`. Ninguna operación expone la ruta
 * física interna de una entrega (`Delivery.path`) fuera de este límite.
 */
export class DeliveryController implements ApplicationController {
  readonly resource = "deliveries";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.deliveryManager, "delivery-manager");
    const projects = () => requireDependency(this.context.projectManager, "project");

    const resolveProjectPath = (projectManager: ProjectManager, projectId: string): string => {
      const project = projectManager.getProject(projectId);
      if (!project) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: `No existe ningún proyecto con id "${projectId}".`,
          origin: "validation",
          category: "not-found",
          retryable: false,
          recoverable: true,
        });
      }
      return project.configuration.projectPath;
    };

    // -----------------------------------------------------------------
    // deliveries.list — histórico completo del proyecto, con filtros
    // opcionales de estado/tipo/archivado. Solo lectura.
    // -----------------------------------------------------------------
    permissions.register("deliveries.list", ["read"]);
    operations.register({
      name: "deliveries.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const projectId = requireString(record, "projectId");
        const stateRaw = optionalString(record, "state");
        if (stateRaw !== undefined && !isDeliveryState(stateRaw)) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `El campo "state" no es un estado de entrega válido: "${stateRaw}".`,
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        const typeRaw = optionalString(record, "type");
        if (typeRaw !== undefined && !isDeliveryType(typeRaw)) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `El campo "type" no es un tipo de entrega válido: "${typeRaw}".`,
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        const archived = record["archived"];
        if (archived !== undefined && typeof archived !== "boolean") {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'El campo "archived" debe ser booleano si se proporciona.',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return {
          projectId,
          ...(stateRaw !== undefined ? { state: stateRaw as DeliveryState } : {}),
          ...(typeRaw !== undefined ? { type: typeRaw as DeliveryType } : {}),
          ...(archived !== undefined ? { archived: archived as boolean } : {}),
        };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        const filter: DeliveryFilter = {
          ...(payload.state !== undefined ? { state: payload.state } : {}),
          ...(payload.type !== undefined ? { type: payload.type } : {}),
          ...(payload.archived !== undefined ? { archived: payload.archived } : {}),
        };
        return manager().listDeliveries(projectPath, filter);
      },
    });

    // -----------------------------------------------------------------
    // deliveries.get — una entrega concreta por id, sin la ruta física.
    // -----------------------------------------------------------------
    permissions.register("deliveries.get", ["read"]);
    operations.register({
      name: "deliveries.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        const delivery = await manager().getDelivery(projectPath, payload.id);
        return delivery ? toDeliveryDTO(delivery) : undefined;
      },
    });

    // -----------------------------------------------------------------
    // deliveries.get-active — la entrega vigente del proyecto, si existe.
    // -----------------------------------------------------------------
    permissions.register("deliveries.get-active", ["read"]);
    operations.register({
      name: "deliveries.get-active",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId") };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        const delivery = await manager().getActiveDelivery(projectPath);
        return delivery ? toDeliveryDTO(delivery) : undefined;
      },
    });

    // -----------------------------------------------------------------
    // deliveries.history — histórico completo, ya ordenado, sin filtros.
    // -----------------------------------------------------------------
    permissions.register("deliveries.history", ["read"]);
    operations.register({
      name: "deliveries.history",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId") };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        return manager().getHistory(projectPath);
      },
    });

    // -----------------------------------------------------------------
    // deliveries.import — única operación que copia físicamente una
    // entrega nueva bajo ENTREGAS/. Nunca sobrescribe (DeliveryManager
    // ya lo garantiza); este controlador no repite esa lógica.
    // -----------------------------------------------------------------
    permissions.register("deliveries.import", ["write", "import"]);
    operations.register({
      name: "deliveries.import",
      version: "1.0.0",
      capabilities: ["write", "import"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const projectId = requireString(record, "projectId");
        const sourceType = record["sourceType"];
        if (!isDeliverySourceType(sourceType)) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: 'El campo "sourceType" debe ser "folder" o "zip".',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        const sourcePath = requireString(record, "sourcePath");
        const label = requireString(record, "label");
        const type = optionalString(record, "type");
        const version = optionalString(record, "version");
        const notes = optionalString(record, "notes");
        const deliveredAt = optionalString(record, "deliveredAt");
        return {
          projectId,
          sourceType,
          sourcePath,
          label,
          ...(type !== undefined ? { type: type as DeliveryType } : {}),
          ...(version !== undefined ? { version } : {}),
          ...(notes !== undefined ? { notes } : {}),
          ...(deliveredAt !== undefined ? { deliveredAt } : {}),
        };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        const delivery = await manager().importDelivery({
          projectId: payload.projectId,
          projectPath,
          sourceType: payload.sourceType,
          sourcePath: payload.sourcePath,
          label: payload.label,
          ...(payload.type !== undefined ? { type: payload.type } : {}),
          ...(payload.version !== undefined ? { version: payload.version } : {}),
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
          ...(payload.deliveredAt !== undefined ? { deliveredAt: payload.deliveredAt } : {}),
        });
        return toDeliveryDTO(delivery);
      },
    });

    // -----------------------------------------------------------------
    // deliveries.compare — compara dos entregas ya existentes del mismo
    // proyecto (hash, tamaño, ficheros, carpetas). Solo lectura.
    // -----------------------------------------------------------------
    permissions.register("deliveries.compare", ["read"]);
    operations.register({
      name: "deliveries.compare",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          idA: requireString(record, "idA"),
          idB: requireString(record, "idB"),
        };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        return manager().compareDeliveries(projectPath, payload.idA, payload.idB);
      },
    });

    // -----------------------------------------------------------------
    // deliveries.verify-integrity — recalcula el hash actual y lo
    // compara con el almacenado en la importación. Solo lectura del
    // disco (no modifica la entrega).
    // -----------------------------------------------------------------
    permissions.register("deliveries.verify-integrity", ["read"]);
    operations.register({
      name: "deliveries.verify-integrity",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        return manager().verifyIntegrity(projectPath, payload.id);
      },
    });

    // -----------------------------------------------------------------
    // deliveries.archive — decisión terminal y explícita; exige
    // confirmación (documento §Permisos: operación destructiva).
    // -----------------------------------------------------------------
    permissions.register("deliveries.archive", ["write", "archive"], { destructive: true });
    operations.register({
      name: "deliveries.archive",
      version: "1.0.0",
      capabilities: ["write", "archive"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const projectId = requireString(record, "projectId");
        const id = requireString(record, "id");
        const notes = optionalString(record, "notes");
        return { projectId, id, ...(notes !== undefined ? { notes } : {}) };
      },
      handler: async (payload) => {
        const projectPath = resolveProjectPath(projects(), payload.projectId);
        const delivery = await manager().archiveDelivery(projectPath, payload.id, {
          ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        });
        return toDeliveryDTO(delivery);
      },
    });
  }
}
