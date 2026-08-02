import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalString,
  requireRecord,
  requireString,
} from "../payloadHelpers.js";
import type { Project, ProjectConfiguration } from "@dwm/project";

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
  }
}
