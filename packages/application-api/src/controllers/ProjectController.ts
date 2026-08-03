import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalString,
  requireRecord,
  requireString,
} from "../payloadHelpers.js";
import type { Project, ProjectConfiguration } from "@dwm/project";
import { appendClientActivity } from "../ActivityLog.js";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "projects.list": { payload: Record<string, never>; result: string[] };
    "projects.get": { payload: { id: string }; result: Project | undefined };
    "projects.create": {
      payload: { name: string; description: string; configuration: ProjectConfiguration };
      result: Project;
    };
    "projects.update": {
      payload: {
        id: string;
        name?: string;
        description?: string;
        configuration?: ProjectConfiguration;
      };
      result: { updated: true };
    };
    "projects.delete": { payload: { id: string }; result: { deleted: true } };
    /** Archiva un proyecto (nunca lo elimina): reutiliza ProjectManager.closeProject() tal cual. */
    "projects.archive": { payload: { id: string }; result: Project };
    "projects.open-in-vscode": {
      payload: { id: string };
      result: { opened: boolean; message: string };
    };
  }
}

/** Módulo 31 — controlador del recurso `projects`, delega exclusivamente en `@dwm/project`. */
export class ProjectController implements ApplicationController {
  readonly resource = "projects";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.projectManager, "project-manager");

    permissions.register("projects.list", ["read"]);
    operations.register({
      name: "projects.list",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().listProjects(),
    });

    permissions.register("projects.get", ["read"]);
    operations.register({
      name: "projects.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => manager().getProject(payload.id),
    });

    permissions.register("projects.create", ["write"]);
    operations.register({
      name: "projects.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const name = requireString(record, "name");
        const description = requireString(record, "description");
        const configuration = requireRecord(
          record,
          "configuration"
        ) as unknown as ProjectConfiguration;
        assertSafeOptionalPath(configuration as unknown as Record<string, unknown>, "projectPath", {
          allowAbsolute: true,
        });
        return { name, description, configuration };
      },
      handler: async (payload) =>
        manager().createProject(payload.name, payload.description, payload.configuration),
    });

    permissions.register("projects.update", ["write"]);
    operations.register({
      name: "projects.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const name = optionalString(record, "name");
        const description = optionalString(record, "description");
        const configuration = record["configuration"] as ProjectConfiguration | undefined;
        return {
          id,
          ...(name ? { name } : {}),
          ...(description ? { description } : {}),
          ...(configuration ? { configuration } : {}),
        };
      },
      handler: async (payload) => {
        await manager().updateProject(payload.id, {
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.description ? { description: payload.description } : {}),
          ...(payload.configuration ? { configuration: payload.configuration } : {}),
        });
        return { updated: true as const };
      },
    });

    permissions.register("projects.delete", ["delete"], { destructive: true });
    operations.register({
      name: "projects.delete",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => {
        await manager().deleteProject(payload.id);
        return { deleted: true as const };
      },
    });

    // "Archivar proyecto desde la ficha del cliente" (encargo, cierre de
    // limitaciones item 2): reutiliza tal cual ProjectManager.closeProject()
    // — nunca elimina, solo transiciona el estado a "closed". Requiere
    // confirmación (destructive: true), igual que projects.delete.
    permissions.register("projects.archive", ["write"], { destructive: true });
    operations.register({
      name: "projects.archive",
      version: "1.0.0",
      capabilities: ["write"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => {
        await manager().closeProject(payload.id);
        const project = manager().getProject(payload.id);
        if (!project) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `No existe ningún proyecto con id "${payload.id}".`,
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        await this.logProjectActivity(project, () => ({
          type: "project.archived",
          message: `Proyecto «${project.metadata.name}» archivado.`,
          relatedProjectId: project.id,
        }));
        return project;
      },
    });

    // Reutiliza tal cual EnvironmentManager.openInVSCode() (Commit 3 de
    // client-workflow-v2); ProjectController es el punto natural para
    // "abrir en VS Code" un proyecto ya existente por id.
    permissions.register("projects.open-in-vscode", ["read"]);
    operations.register({
      name: "projects.open-in-vscode",
      version: "1.0.0",
      capabilities: ["read"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        return { id };
      },
      handler: async (payload) => {
        const project = manager().getProject(payload.id);
        if (!project) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `No existe ningún proyecto con id "${payload.id}".`,
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        const environmentManager = requireDependency(
          this.context.environmentManager,
          "environment-manager"
        );
        const result = await environmentManager.openInVSCode(project.configuration.projectPath);
        if (result.opened) {
          await this.logProjectActivity(project, () => ({
            type: "project.opened-in-vscode",
            message: `VS Code abierto para «${project.metadata.name}».`,
            relatedProjectId: project.id,
          }));
        }
        return result;
      },
    });
  }

  /** Registra actividad real (encargo, item 3) solo cuando el proyecto tiene cliente asociado; nunca falla la operación principal si el registro falla. */
  /** Registra actividad real (encargo, item 3): secundario siempre — si falta clientId, portableWorkspaceManager, Workspace activo, o falla por cualquier otro motivo (incluida la propia construcción de `entry`), nunca rompe la operación principal. */
  private async logProjectActivity(
    project: Project,
    buildEntry: () => { type: string; message: string; relatedProjectId?: string }
  ): Promise<void> {
    try {
      const clientId = project.configuration?.clientId;
      if (!clientId) return;
      const active = this.context.portableWorkspaceManager?.getActiveWorkspace();
      if (!active) return;
      await appendClientActivity(active.root, clientId, buildEntry());
    } catch {
      // La actividad es secundaria: nunca debe romper la operación principal.
    }
  }
}
