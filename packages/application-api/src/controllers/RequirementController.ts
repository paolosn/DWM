import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, requireString, optionalString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { resolveClientContentRoot } from "@dwm/project-provisioning";
import type {
  Requirement,
  RequirementCreateRequest,
  RequirementPriority,
  RequirementResourceSet,
  RequirementStatus,
  RequirementUpdateRequest,
} from "@dwm/requirement-manager";
import { REQUIREMENT_PRIORITIES, REQUIREMENT_STATUSES } from "@dwm/requirement-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /** Crea un requerimiento/trabajo real para un cliente — nunca queda flotante: se vincula a proyecto vía `requirements.link-to-project`. */
    "requirements.create": {
      payload: RequirementCreateRequest;
      result: Requirement;
    };
    "requirements.get": { payload: { id: string; clientId: string }; result: Requirement };
    /** Lista los requerimientos reales de un cliente, opcionalmente filtrados por proyecto o perfil. */
    "requirements.list": {
      payload: { clientId: string; projectId?: string; profileId?: string };
      result: Requirement[];
    };
    "requirements.update": {
      payload: { id: string; clientId: string } & RequirementUpdateRequest;
      result: Requirement;
    };
    /** Vincula el requerimiento a un proyecto real — el paso obligatorio tras "Cliente acepta". */
    "requirements.link-to-project": {
      payload: { id: string; clientId: string; projectId: string };
      result: Requirement;
    };
  }
}

function isRequirementStatus(value: unknown): value is RequirementStatus {
  return REQUIREMENT_STATUSES.includes(value as RequirementStatus);
}

function isRequirementPriority(value: unknown): value is RequirementPriority {
  return REQUIREMENT_PRIORITIES.includes(value as RequirementPriority);
}

function readResourceSet(
  record: Record<string, unknown>,
  key: string
): RequirementResourceSet | undefined {
  const value = record[key];
  if (!value || typeof value !== "object") return undefined;
  return value as RequirementResourceSet;
}

/**
 * client-workflow "feature/requirement-workflow" (Commit 1) —
 * controlador fino: delega íntegramente en `RequirementManager` (sin
 * lógica de negocio propia). Resuelve el `clientRoot` real igual que
 * el resto del código ya existente (`resolveClientContentRoot`,
 * también reutilizado por `resolveContentRoot.ts` para el alcance de
 * cliente de Agentes/Skills/Reglas) — ningún sistema de rutas nuevo.
 */
export class RequirementController implements ApplicationController {
  readonly resource = "requirements";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.requirementManager, "requirement-manager");

    const clientRoot = (clientId: string): string => {
      const active = this.context.portableWorkspaceManager?.getActiveWorkspace();
      if (!active) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: "No hay ningún Sistema de Trabajo activo.",
          origin: "validation",
          category: "not-found",
          retryable: false,
          recoverable: true,
        });
      }
      return resolveClientContentRoot(active.root, clientId);
    };

    permissions.register("requirements.create", ["write"]);
    operations.register({
      name: "requirements.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          title: requireString(record, "title"),
          description: requireString(record, "description"),
          type: requireString(record, "type"),
          clientId: requireString(record, "clientId"),
          ...(record.analysis !== undefined ? { analysis: record.analysis } : {}),
          ...(isRequirementPriority(record.priority) ? { priority: record.priority } : {}),
          ...(optionalString(record, "profileId") !== undefined
            ? { profileId: optionalString(record, "profileId")! }
            : {}),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
          ...(optionalString(record, "briefing") !== undefined
            ? { briefing: optionalString(record, "briefing")! }
            : {}),
          ...(readResourceSet(record, "recommendedResources")
            ? { recommendedResources: readResourceSet(record, "recommendedResources")! }
            : {}),
          ...(optionalString(record, "notes") !== undefined
            ? { notes: optionalString(record, "notes")! }
            : {}),
        };
      },
      handler: async (payload) =>
        manager().createRequirement(payload, clientRoot(payload.clientId)),
    });

    permissions.register("requirements.get", ["read"]);
    operations.register({
      name: "requirements.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id"), clientId: requireString(record, "clientId") };
      },
      handler: async (payload) =>
        manager().getRequirement(payload.id, clientRoot(payload.clientId)),
    });

    permissions.register("requirements.list", ["read"]);
    operations.register({
      name: "requirements.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
          ...(optionalString(record, "profileId") !== undefined
            ? { profileId: optionalString(record, "profileId")! }
            : {}),
        };
      },
      handler: async (payload) =>
        manager().listRequirements({
          clientRoot: clientRoot(payload.clientId),
          ...(payload.projectId ? { projectId: payload.projectId } : {}),
          ...(payload.profileId ? { profileId: payload.profileId } : {}),
        }),
    });

    permissions.register("requirements.update", ["write"]);
    operations.register({
      name: "requirements.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          clientId: requireString(record, "clientId"),
          ...(optionalString(record, "title") !== undefined
            ? { title: optionalString(record, "title")! }
            : {}),
          ...(optionalString(record, "description") !== undefined
            ? { description: optionalString(record, "description")! }
            : {}),
          ...(isRequirementStatus(record.status) ? { status: record.status } : {}),
          ...(isRequirementPriority(record.priority) ? { priority: record.priority } : {}),
          ...(optionalString(record, "profileId") !== undefined
            ? { profileId: optionalString(record, "profileId")! }
            : {}),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
          ...(optionalString(record, "briefing") !== undefined
            ? { briefing: optionalString(record, "briefing")! }
            : {}),
          ...(readResourceSet(record, "recommendedResources")
            ? { recommendedResources: readResourceSet(record, "recommendedResources")! }
            : {}),
          ...(readResourceSet(record, "appliedResources")
            ? { appliedResources: readResourceSet(record, "appliedResources")! }
            : {}),
          ...(optionalString(record, "notes") !== undefined
            ? { notes: optionalString(record, "notes")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const { id, clientId, ...updates } = payload;
        return manager().updateRequirement(id, updates, clientRoot(clientId));
      },
    });

    permissions.register("requirements.link-to-project", ["write"]);
    operations.register({
      name: "requirements.link-to-project",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          clientId: requireString(record, "clientId"),
          projectId: requireString(record, "projectId"),
        };
      },
      handler: async (payload) =>
        manager().linkToProject(payload.id, payload.projectId, clientRoot(payload.clientId)),
    });
  }
}
