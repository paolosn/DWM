import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import * as path from "node:path";
import { promises as fs } from "node:fs";
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
    /**
     * client-workflow "fix/library-edit-and-simple-ai" — resuelve la
     * ruta absoluta real de una regla ya existente (`.kilo/rules/<id>.md`).
     * El renderer nunca construye la ruta por su cuenta.
     */
    "rules.get-file-path": { payload: { id: string; root?: string }; result: { path: string } };
    /**
     * client-workflow "fix/kilo-file-editing-and-ai-status" — abre el
     * fichero real (`.kilo/rules/<id>.md`) directamente en VS Code,
     * reutilizando EnvironmentManager.openInVSCode() tal cual.
     */
    "rules.edit-file": {
      payload: { id: string; root?: string };
      result: { opened: boolean; message: string };
    };
    /**
     * client-workflow "fix/kilo-open-folder" — resuelve la ruta real
     * de la CARPETA `.kilo/rules` a partir de una raíz ya resuelta
     * por `content-scope.resolve-root`. Crea la carpeta si todavía no
     * existe.
     */
    "rules.get-folder-path": { payload: { root: string }; result: { path: string } };
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

    permissions.register("rules.get-file-path", ["read"]);
    operations.register({
      name: "rules.get-file-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => ({
        path: await manager().getRuleFilePath(payload.id, payload.root),
      }),
    });

    permissions.register("rules.edit-file", ["read"]);
    operations.register({
      name: "rules.edit-file",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => {
        const filePath = await manager().getRuleFilePath(payload.id, payload.root);
        return requireDependency(
          this.context.environmentManager,
          "environment-manager"
        ).openInVSCode(filePath);
      },
    });

    permissions.register("rules.get-folder-path", ["read"]);
    operations.register({
      name: "rules.get-folder-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const root = requireString(record, "root");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root };
      },
      handler: async (payload) => {
        const folderPath = path.join(payload.root, ".kilo", "rules");
        await fs.mkdir(folderPath, { recursive: true });
        return { path: folderPath };
      },
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
