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
  optionalStringArray,
  requireString,
} from "../payloadHelpers.js";
import type { KnowledgeItem, KnowledgeSummary } from "@dwm/knowledge-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "knowledge.list": {
      payload: { includeArchived?: boolean; root?: string };
      result: KnowledgeSummary[];
    };
    "knowledge.get": { payload: { id: string; root?: string }; result: KnowledgeItem };
    "knowledge.search": {
      payload: { query: string; root?: string };
      result: KnowledgeSummary[];
    };
    "knowledge.create": {
      payload: {
        id: string;
        content: string;
        tags?: readonly string[];
        category?: string;
        root?: string;
      };
      result: KnowledgeItem;
    };
    "knowledge.update": {
      payload: { id: string; content: string; root?: string };
      result: KnowledgeItem;
    };
    "knowledge.archive": { payload: { id: string; root?: string }; result: KnowledgeItem };
    "knowledge.restore": { payload: { id: string; root?: string }; result: KnowledgeItem };
    "knowledge.delete": { payload: { id: string; root?: string }; result: { deleted: true } };
  }
}

/** Módulo 31 — controlador del recurso `knowledge`, delega exclusivamente en `@dwm/knowledge-manager`. */
export class KnowledgeController implements ApplicationController {
  readonly resource = "knowledge";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.knowledgeManager, "knowledge-manager");

    permissions.register("knowledge.list", ["read"]);
    operations.register({
      name: "knowledge.list",
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
      handler: async (payload) => manager().listKnowledge(payload),
    });

    permissions.register("knowledge.get", ["read"]);
    operations.register({
      name: "knowledge.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().getKnowledge(payload.id, payload.root),
    });

    permissions.register("knowledge.search", ["read"]);
    operations.register({
      name: "knowledge.search",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const query = requireString(record, "query");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { query, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().searchKnowledge(payload.query, payload.root),
    });

    permissions.register("knowledge.create", ["write"]);
    operations.register({
      name: "knowledge.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const content = requireString(record, "content");
        const tags = optionalStringArray(record, "tags");
        const category = optionalString(record, "category");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return {
          id,
          content,
          ...(tags ? { tags } : {}),
          ...(category ? { category } : {}),
          root: optionalString(record, "root"),
        };
      },
      handler: async (payload) =>
        manager().createKnowledge(
          {
            id: payload.id,
            content: payload.content,
            ...(payload.tags ? { tags: payload.tags } : {}),
            ...(payload.category ? { category: payload.category } : {}),
          },
          payload.root
        ),
    });

    permissions.register("knowledge.update", ["write"]);
    operations.register({
      name: "knowledge.update",
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
        manager().updateKnowledge(payload.id, payload.content, payload.root),
    });

    permissions.register("knowledge.archive", ["archive"]);
    operations.register({
      name: "knowledge.archive",
      version: "1.0.0",
      capabilities: ["archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().archiveKnowledge(payload.id, payload.root),
    });

    permissions.register("knowledge.restore", ["restore"]);
    operations.register({
      name: "knowledge.restore",
      version: "1.0.0",
      capabilities: ["restore"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().restoreKnowledge(payload.id, payload.root),
    });

    permissions.register("knowledge.delete", ["delete"], { destructive: true });
    operations.register({
      name: "knowledge.delete",
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
        await manager().deleteKnowledge(payload.id, { confirmPermanent: true }, payload.root);
        return { deleted: true as const };
      },
    });
  }
}
