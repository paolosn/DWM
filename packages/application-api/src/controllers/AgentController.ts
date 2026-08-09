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
import type { Agent, AgentCreateRequest, AgentSummary } from "@dwm/agent-manager";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "agents.list": {
      payload: { includeArchived?: boolean; root?: string };
      result: AgentSummary[];
    };
    "agents.get": { payload: { id: string; root?: string }; result: Agent };
    /**
     * client-workflow "fix/library-edit-and-simple-ai" — resuelve la
     * ruta absoluta real del fichero físico de un agente ya existente
     * (`.kilo/agents/<id>.md`). El renderer nunca construye la ruta
     * por su cuenta: solo envía `id`/`root`, y el backend la resuelve
     * y valida que el agente existe de verdad antes de devolverla.
     */
    "agents.get-file-path": { payload: { id: string; root?: string }; result: { path: string } };
    /**
     * client-workflow "fix/kilo-file-editing-and-ai-status" — abre el
     * fichero real (`.kilo/agents/<id>.md`) directamente en VS Code,
     * reutilizando EnvironmentManager.openInVSCode() tal cual (el CLI
     * `code` acepta un fichero igual que una carpeta) y la misma
     * resolución de ruta real que `agents.get-file-path`. Ningún
     * editor Markdown paralelo.
     */
    "agents.edit-file": {
      payload: { id: string; root?: string };
      result: { opened: boolean; message: string };
    };
    /**
     * client-workflow "fix/kilo-open-folder" — resuelve la ruta real
     * de la CARPETA `.kilo/agents` (no de un fichero concreto) a
     * partir de una raíz ya resuelta por `content-scope.resolve-root`
     * (global/cliente/proyecto). Nunca construida en el renderer.
     * Reutiliza la misma convención real ya usada por
     * `ClientContentPaths.ensureClientKiloSkeleton` — ningún sistema
     * de resolución de rutas nuevo. Crea la carpeta si todavía no
     * existe (mismo esqueleto mínimo, idempotente).
     */
    "agents.get-folder-path": { payload: { root: string }; result: { path: string } };
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

    permissions.register("agents.get-file-path", ["read"]);
    operations.register({
      name: "agents.get-file-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => ({
        path: await manager().getAgentFilePath(payload.id, payload.root),
      }),
    });

    permissions.register("agents.edit-file", ["read"]);
    operations.register({
      name: "agents.edit-file",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => {
        const filePath = await manager().getAgentFilePath(payload.id, payload.root);
        return requireDependency(
          this.context.environmentManager,
          "environment-manager"
        ).openInVSCode(filePath);
      },
    });

    permissions.register("agents.get-folder-path", ["read"]);
    operations.register({
      name: "agents.get-folder-path",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const root = requireString(record, "root");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { root };
      },
      handler: async (payload) => {
        const folderPath = path.join(payload.root, ".kilo", "agents");
        await fs.mkdir(folderPath, { recursive: true });
        return { path: folderPath };
      },
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
