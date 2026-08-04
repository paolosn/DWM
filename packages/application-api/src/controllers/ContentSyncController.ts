import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalBoolean, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type {
  SyncKind,
  SyncPreview,
  AssignResult,
  WithdrawResult,
} from "@dwm/project-provisioning";

export interface ContentSyncCatalogEntry {
  readonly id: string;
  readonly name?: string;
  readonly preview: SyncPreview;
}

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /** Catálogo global real (Agentes/Skills/Reglas) con el estado de sincronización real frente a un proyecto — reutiliza exclusivamente ContentSyncService.previewAssign(). */
    "content-sync.list-catalog": {
      payload: { kind: SyncKind; targetProjectId: string };
      result: ContentSyncCatalogEntry[];
    };
    "content-sync.assign": {
      payload: { kind: SyncKind; id: string; targetProjectId: string; confirmOverwrite?: boolean };
      result: AssignResult;
    };
    "content-sync.withdraw": {
      payload: { kind: SyncKind; id: string; targetProjectId: string };
      result: WithdrawResult;
    };
  }
}

/**
 * client-workflow "kilo-content-integration" (Commit 3) — controlador
 * fino: no contiene ninguna lógica de sincronización propia, delega
 * exclusivamente en `ContentSyncService` (Commit 2, ya probado). El
 * origen es siempre el catálogo global del Workspace activo; el
 * destino, la carpeta real de un proyecto ya registrado.
 */
export class ContentSyncController implements ApplicationController {
  readonly resource = "content-sync";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const service = () =>
      requireDependency(this.context.contentSyncService, "content-sync-service");

    const sourceRoot = (): string => {
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
      return active.root;
    };

    const targetRoot = (projectId: string): string => {
      const project = this.context.projectManager?.getProject(projectId);
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

    const assertValidKind = (record: Record<string, unknown>): SyncKind => {
      const kind = requireString(record, "kind");
      if (kind !== "agent" && kind !== "skill" && kind !== "rule") {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
          message: '"kind" debe ser "agent", "skill" o "rule".',
          origin: "validation",
          category: "validation",
          retryable: false,
          recoverable: true,
        });
      }
      return kind;
    };

    permissions.register("content-sync.list-catalog", ["read"]);
    operations.register({
      name: "content-sync.list-catalog",
      version: "1.0.0",
      capabilities: ["read"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          kind: assertValidKind(record),
          targetProjectId: requireString(record, "targetProjectId"),
        };
      },
      handler: async (payload) => {
        const root = sourceRoot();
        const target = targetRoot(payload.targetProjectId);
        const summaries =
          payload.kind === "agent"
            ? await requireDependency(this.context.agentManager, "agent-manager").listAgents({
                root,
              })
            : payload.kind === "skill"
              ? await requireDependency(this.context.skillManager, "skill-manager").listSkills({
                  root,
                })
              : await requireDependency(this.context.ruleManager, "rule-manager").listRules({
                  root,
                });

        const entries: ContentSyncCatalogEntry[] = [];
        for (const summary of summaries) {
          const preview = await service().previewAssign(payload.kind, summary.id, root, target);
          entries.push({
            id: summary.id,
            ...("name" in summary && summary.name ? { name: summary.name } : {}),
            ...("title" in summary && (summary as { title?: string }).title
              ? { name: (summary as { title?: string }).title }
              : {}),
            preview,
          });
        }
        return entries;
      },
    });

    permissions.register("content-sync.assign", ["write"]);
    operations.register({
      name: "content-sync.assign",
      version: "1.0.0",
      capabilities: ["write"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          kind: assertValidKind(record),
          id: requireString(record, "id"),
          targetProjectId: requireString(record, "targetProjectId"),
          ...(optionalBoolean(record, "confirmOverwrite") !== undefined
            ? { confirmOverwrite: optionalBoolean(record, "confirmOverwrite")! }
            : {}),
        };
      },
      handler: async (payload) =>
        service().assign(
          payload.kind,
          payload.id,
          sourceRoot(),
          targetRoot(payload.targetProjectId),
          {
            ...(payload.confirmOverwrite !== undefined
              ? { confirmOverwrite: payload.confirmOverwrite }
              : {}),
          }
        ),
    });

    permissions.register("content-sync.withdraw", ["write"]);
    operations.register({
      name: "content-sync.withdraw",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          kind: assertValidKind(record),
          id: requireString(record, "id"),
          targetProjectId: requireString(record, "targetProjectId"),
        };
      },
      handler: async (payload) =>
        service().withdraw(payload.kind, payload.id, targetRoot(payload.targetProjectId)),
    });
  }
}
