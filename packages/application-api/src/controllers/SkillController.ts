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
import type { Skill, SkillSummary } from "@dwm/skill-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "skills.list": {
      payload: { includeArchived?: boolean; root?: string };
      result: SkillSummary[];
    };
    "skills.get": { payload: { id: string; root?: string }; result: Skill };
    /**
     * client-workflow "fix/library-edit-and-simple-ai" — resuelve la
     * ruta absoluta real de una skill ya existente (`.kilo/skills/<id>/SKILL.md`).
     * El renderer nunca construye la ruta por su cuenta.
     */
    "skills.get-file-path": { payload: { id: string; root?: string }; result: { path: string } };
    /**
     * client-workflow "fix/kilo-file-editing-and-ai-status" — abre el
     * fichero real (`.kilo/skills/<id>/SKILL.md`) directamente en VS
     * Code, reutilizando EnvironmentManager.openInVSCode() tal cual.
     */
    "skills.edit-file": {
      payload: { id: string; root?: string };
      result: { opened: boolean; message: string };
    };
    /**
     * client-workflow "fix/kilo-open-folder" — resuelve la ruta real
     * de la CARPETA `.kilo/skills` a partir de una raíz ya resuelta
     * por `content-scope.resolve-root`. Crea la carpeta si todavía no
     * existe.
     */
    "skills.get-folder-path": { payload: { root: string }; result: { path: string } };
    "skills.create": { payload: { id: string; content: string; root?: string }; result: Skill };
    "skills.update": { payload: { id: string; content: string; root?: string }; result: Skill };
    "skills.duplicate": { payload: { id: string; newId: string; root?: string }; result: Skill };
    "skills.archive": { payload: { id: string; root?: string }; result: Skill };
    "skills.restore": { payload: { id: string; root?: string }; result: Skill };
    "skills.delete": { payload: { id: string; root?: string }; result: { deleted: true } };
  }
}

/** Módulo 31 — controlador del recurso `skills`, delega exclusivamente en `@dwm/skill-manager`. */
export class SkillController implements ApplicationController {
  readonly resource = "skills";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.skillManager, "skill-manager");

    permissions.register("skills.list", ["read"]);
    operations.register({
      name: "skills.list",
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
      handler: async (payload) => manager().listSkills(payload),
    });

    permissions.register("skills.get", ["read"]);
    operations.register({
      name: "skills.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().getSkill(payload.id, payload.root),
    });

    permissions.register("skills.get-file-path", ["read"]);
    operations.register({
      name: "skills.get-file-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => ({
        path: await manager().getSkillFilePath(payload.id, payload.root),
      }),
    });

    permissions.register("skills.edit-file", ["read"]);
    operations.register({
      name: "skills.edit-file",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => {
        const filePath = await manager().getSkillFilePath(payload.id, payload.root);
        return requireDependency(
          this.context.environmentManager,
          "environment-manager"
        ).openInVSCode(filePath);
      },
    });

    permissions.register("skills.get-folder-path", ["read"]);
    operations.register({
      name: "skills.get-folder-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const root = requireString(record, "root");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root };
      },
      handler: async (payload) => {
        const folderPath = path.join(payload.root, ".kilo", "skills");
        await fs.mkdir(folderPath, { recursive: true });
        return { path: folderPath };
      },
    });

    permissions.register("skills.create", ["write"]);
    operations.register({
      name: "skills.create",
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
        manager().createSkill({ id: payload.id, content: payload.content }, payload.root),
    });

    permissions.register("skills.update", ["write"]);
    operations.register({
      name: "skills.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const content = requireString(record, "content");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, content, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().updateSkill(payload.id, payload.content, payload.root),
    });

    permissions.register("skills.duplicate", ["write"]);
    operations.register({
      name: "skills.duplicate",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const newId = requireString(record, "newId");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, newId, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().duplicateSkill(payload.id, payload.newId, payload.root),
    });

    permissions.register("skills.archive", ["archive"]);
    operations.register({
      name: "skills.archive",
      version: "1.0.0",
      capabilities: ["archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().archiveSkill(payload.id, payload.root),
    });

    permissions.register("skills.restore", ["restore"]);
    operations.register({
      name: "skills.restore",
      version: "1.0.0",
      capabilities: ["restore"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().restoreSkill(payload.id, payload.root),
    });

    permissions.register("skills.delete", ["delete"], { destructive: true });
    operations.register({
      name: "skills.delete",
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
        // La confirmación de frontera ya la exige el router; aquí se traduce
        // en el `confirmPermanent` que exige el dominio de `SkillManager`.
        await manager().deleteSkill(payload.id, { confirmPermanent: true }, payload.root);
        return { deleted: true as const };
      },
    });
  }
}
