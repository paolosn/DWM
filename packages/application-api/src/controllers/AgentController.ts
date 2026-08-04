import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalBoolean,
  optionalString,
  requireString,
} from "../payloadHelpers.js";
import type { Agent, AgentCreateRequest, AgentSummary } from "@dwm/agent-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "agents.list": {
      payload: { includeArchived?: boolean; root?: string };
      result: AgentSummary[];
    };
    "agents.get": { payload: { id: string; root?: string }; result: Agent };
    "agents.create": { payload: AgentCreateRequest & { root?: string }; result: Agent };
    "agents.update": {
      payload: { id: string; content: string; root?: string };
      result: Agent;
    };
    "agents.duplicate": { payload: { id: string; newId: string; root?: string }; result: Agent };
    "agents.archive": { payload: { id: string; root?: string }; result: Agent };
    "agents.restore": { payload: { id: string; root?: string }; result: Agent };
    "agents.delete": { payload: { id: string; root?: string }; result: { deleted: true } };
  }
}

/** Módulo 31 — controlador del recurso `agents`, delega exclusivamente en `@dwm/agent-manager`. */
export class AgentController implements ApplicationController {
  readonly resource = "agents";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.agentManager, "agent-manager");

    permissions.register("agents.list", ["read"]);
    operations.register({
      name: "agents.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload ?? {});
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        const includeArchived = optionalBoolean(record, "includeArchived");
        const root = optionalString(record, "root");
        return {
          ...(includeArchived !== undefined ? { includeArchived } : {}),
          ...(root !== undefined ? { root } : {}),
        };
      },
      handler: async (payload) => manager().listAgents(payload),
    });

    permissions.register("agents.get", ["read"]);
    operations.register({
      name: "agents.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().getAgent(payload.id, payload.root),
    });

    permissions.register("agents.create", ["write"]);
    operations.register({
      name: "agents.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const content = requireString(record, "content");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, content, root: optionalString(record, "root") };
      },
      handler: async (payload) =>
        manager().createAgent({ id: payload.id, content: payload.content }, payload.root),
    });

    permissions.register("agents.update", ["write"]);
    operations.register({
      name: "agents.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const content = requireString(record, "content");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, content, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().updateAgent(payload.id, payload.content, payload.root),
    });

    permissions.register("agents.duplicate", ["write"]);
    operations.register({
      name: "agents.duplicate",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const newId = requireString(record, "newId");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, newId, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().duplicateAgent(payload.id, payload.newId, payload.root),
    });

    permissions.register("agents.archive", ["archive"]);
    operations.register({
      name: "agents.archive",
      version: "1.0.0",
      capabilities: ["archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().archiveAgent(payload.id, payload.root),
    });

    permissions.register("agents.restore", ["restore"]);
    operations.register({
      name: "agents.restore",
      version: "1.0.0",
      capabilities: ["restore"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().restoreAgent(payload.id, payload.root),
    });

    permissions.register("agents.delete", ["delete"], { destructive: true });
    operations.register({
      name: "agents.delete",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => {
        await manager().deleteAgent(payload.id, payload.root);
        return { deleted: true as const };
      },
    });
  }
}
