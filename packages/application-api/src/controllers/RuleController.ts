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
import type { Rule, RuleSummary } from "@dwm/rule-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "rules.list": { payload: { includeArchived?: boolean; root?: string }; result: RuleSummary[] };
    "rules.get": { payload: { id: string; root?: string }; result: Rule };
    "rules.create": { payload: { id: string; content: string; root?: string }; result: Rule };
    "rules.update": { payload: { id: string; content: string; root?: string }; result: Rule };
    "rules.duplicate": { payload: { id: string; newId: string; root?: string }; result: Rule };
    "rules.archive": { payload: { id: string; root?: string }; result: Rule };
    "rules.restore": { payload: { id: string; root?: string }; result: Rule };
    "rules.delete": { payload: { id: string; root?: string }; result: { deleted: true } };
  }
}

/** Módulo 31 — controlador del recurso `rules`, delega exclusivamente en `@dwm/rule-manager`. */
export class RuleController implements ApplicationController {
  readonly resource = "rules";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.ruleManager, "rule-manager");

    permissions.register("rules.list", ["read"]);
    operations.register({
      name: "rules.list",
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
      handler: async (payload) => manager().listRules(payload),
    });

    permissions.register("rules.get", ["read"]);
    operations.register({
      name: "rules.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().getRule(payload.id, payload.root),
    });

    permissions.register("rules.create", ["write"]);
    operations.register({
      name: "rules.create",
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
        manager().createRule({ id: payload.id, content: payload.content }, payload.root),
    });

    permissions.register("rules.update", ["write"]);
    operations.register({
      name: "rules.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const content = requireString(record, "content");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, content, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().updateRule(payload.id, payload.content, payload.root),
    });

    permissions.register("rules.duplicate", ["write"]);
    operations.register({
      name: "rules.duplicate",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const newId = requireString(record, "newId");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, newId, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().duplicateRule(payload.id, payload.newId, payload.root),
    });

    permissions.register("rules.archive", ["archive"]);
    operations.register({
      name: "rules.archive",
      version: "1.0.0",
      capabilities: ["archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().archiveRule(payload.id, payload.root),
    });

    permissions.register("rules.restore", ["restore"]);
    operations.register({
      name: "rules.restore",
      version: "1.0.0",
      capabilities: ["restore"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().restoreRule(payload.id, payload.root),
    });

    permissions.register("rules.delete", ["delete"], { destructive: true });
    operations.register({
      name: "rules.delete",
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
        await manager().deleteRule(payload.id, payload.root);
        return { deleted: true as const };
      },
    });
  }
}
