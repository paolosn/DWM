import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import * as path from "node:path";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalBoolean,
  optionalString,
  optionalStringArray,
  requireString,
} from "../payloadHelpers.js";
import type { Client, ClientSummary } from "@dwm/client-manager";
import { listClientActivity, type ActivityEntry } from "../ActivityLog.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "clients.list": {
      payload: { includeArchived?: boolean; root?: string };
      result: ClientSummary[];
    };
    "clients.get": { payload: { id: string; root?: string }; result: Client };
    "clients.create": {
      payload: {
        id: string;
        name: string;
        slug: string;
        tags?: readonly string[];
        description?: string;
        root?: string;
      };
      result: Client;
    };
    "clients.update": {
      payload: {
        id: string;
        name?: string;
        slug?: string;
        tags?: readonly string[];
        description?: string;
        root?: string;
      };
      result: Client;
    };
    "clients.delete": { payload: { id: string; root?: string }; result: { deleted: true } };
    "clients.archive": { payload: { id: string; root?: string }; result: Client };
    "clients.restore": { payload: { id: string; root?: string }; result: Client };
    /** Cronología real de actividad del cliente (encargo, cierre de limitaciones item 3). Solo lectura. */
    "clients.activity": { payload: { id: string }; result: ActivityEntry[] };
  }
}

/** Módulo 31 — controlador del recurso `clients`, delega exclusivamente en `@dwm/client-manager`. */
export class ClientController implements ApplicationController {
  readonly resource = "clients";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.clientManager, "client-manager");

    permissions.register("clients.list", ["read"]);
    operations.register({
      name: "clients.list",
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
      handler: async (payload) => manager().listClients(payload),
    });

    permissions.register("clients.get", ["read"]);
    operations.register({
      name: "clients.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().getClient(payload.id, payload.root),
    });

    permissions.register("clients.create", ["write"]);
    operations.register({
      name: "clients.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const name = requireString(record, "name");
        const slug = requireString(record, "slug");
        const tags = optionalStringArray(record, "tags");
        const description = optionalString(record, "description");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return {
          id,
          name,
          slug,
          ...(tags ? { tags } : {}),
          ...(description ? { description } : {}),
          root: optionalString(record, "root"),
        };
      },
      handler: async (payload) =>
        manager().createClient(
          {
            id: payload.id,
            name: payload.name,
            slug: payload.slug,
            ...(payload.tags ? { tags: payload.tags } : {}),
            ...(payload.description ? { description: payload.description } : {}),
          },
          payload.root
        ),
    });

    permissions.register("clients.update", ["write"]);
    operations.register({
      name: "clients.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        const name = optionalString(record, "name");
        const slug = optionalString(record, "slug");
        const tags = optionalStringArray(record, "tags");
        const description = optionalString(record, "description");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return {
          id,
          ...(name ? { name } : {}),
          ...(slug ? { slug } : {}),
          ...(tags ? { tags } : {}),
          ...(description ? { description } : {}),
          root: optionalString(record, "root"),
        };
      },
      handler: async (payload) =>
        manager().updateClient(
          payload.id,
          {
            ...(payload.name ? { name: payload.name } : {}),
            ...(payload.slug ? { slug: payload.slug } : {}),
            ...(payload.tags ? { tags: payload.tags } : {}),
            ...(payload.description ? { description: payload.description } : {}),
          },
          payload.root
        ),
    });

    permissions.register("clients.archive", ["archive"]);
    operations.register({
      name: "clients.archive",
      version: "1.0.0",
      capabilities: ["archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().archiveClient(payload.id, payload.root),
    });

    permissions.register("clients.restore", ["restore"]);
    operations.register({
      name: "clients.restore",
      version: "1.0.0",
      capabilities: ["restore"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const id = requireString(record, "id");
        assertSafeOptionalPath(record, "root", { allowAbsolute: true });
        return { id, root: optionalString(record, "root") };
      },
      handler: async (payload) => manager().restoreClient(payload.id, payload.root),
    });

    permissions.register("clients.delete", ["delete"], { destructive: true });
    operations.register({
      name: "clients.delete",
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
        await manager().deleteClient(payload.id, { confirmPermanent: true }, payload.root);
        return { deleted: true as const };
      },
    });

    // "Actividad real" (encargo, cierre de limitaciones item 3): lee el
    // fichero JSON-lines del cliente escrito por ProvisioningController/
    // ProjectController/ConnectionsController al ocurrir cada acción real.
    permissions.register("clients.activity", ["read"]);
    operations.register({
      name: "clients.activity",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const psnAdapter = requireDependency(this.context.psnAdapter, "psn-adapter");
        const clientesDir = psnAdapter.getResourcePath("clientes");
        if (!clientesDir) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: "No hay ningún Sistema de Trabajo activo.",
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        const workspaceRoot = path.dirname(clientesDir);
        return [...(await listClientActivity(workspaceRoot, payload.id))];
      },
    });
  }
}
