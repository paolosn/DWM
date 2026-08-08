import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import * as path from "node:path";
import { requireDependency } from "../requireDependency.js";
import {
  asRecord,
  optionalBoolean,
  optionalString,
  optionalStringArray,
  requireString,
} from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { appendClientActivity } from "../ActivityLog.js";
import {
  isConnectionType,
  type Connection,
  type ConnectionGrant,
  type ConnectionProfile,
  type ConnectionTestResult,
  type ConnectionType,
  type McpServerDefinition,
  type SafeConnectionConfig,
} from "@dwm/connections-manager";
import type { ProjectManager } from "@dwm/project";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "connections.list": { payload: { projectId: string }; result: Connection[] };
    "connections.get": {
      payload: { projectId: string; id: string };
      result: Connection | undefined;
    };
    "connections.create": {
      payload: {
        projectId: string;
        name: string;
        type: ConnectionType;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
        profileIds?: readonly string[];
        enabled?: boolean;
      };
      result: Connection;
    };
    "connections.update": {
      payload: {
        projectId: string;
        id: string;
        name?: string;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
        profileIds?: readonly string[];
      };
      result: Connection;
    };
    "connections.test": {
      payload: { projectId: string; id: string };
      result: ConnectionTestResult;
    };
    "connections.enable": { payload: { projectId: string; id: string }; result: Connection };
    "connections.disable": { payload: { projectId: string; id: string }; result: Connection };
    "connections.archive": { payload: { projectId: string; id: string }; result: Connection };
    "connections.restore": { payload: { projectId: string; id: string }; result: Connection };
    "connections.delete": { payload: { projectId: string; id: string }; result: { deleted: true } };
    "connections.capabilities": {
      payload: { projectId: string; id: string };
      result: readonly string[];
    };
    "connections.grants": {
      payload: { projectId: string; id: string };
      result: ConnectionGrant[];
    };
    "connections.assign-capability": {
      payload: { projectId: string; id: string; granteeId: string; capability: string };
      result: { assigned: true };
    };
    "connections.revoke-capability": {
      payload: { projectId: string; id: string; granteeId: string; capability: string };
      result: { revoked: true };
    };

    // Conexiones compartidas de CLIENTE (client-workflow-v2, Commit 5).
    // Mismo ConnectionsManager, mismo modelo de datos y mismo sistema de
    // grants (denegación por defecto) que connections.* de proyecto — solo
    // cambia la raíz de persistencia (por cliente en vez de por proyecto).
    "connections.list-for-client": { payload: { clientId: string }; result: Connection[] };
    "connections.create-for-client": {
      payload: {
        clientId: string;
        name: string;
        type: ConnectionType;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
        enabled?: boolean;
      };
      result: Connection;
    };
    "connections.test-for-client": {
      payload: { clientId: string; id: string };
      result: ConnectionTestResult;
    };
    /** Edición completa de una conexión de cliente (encargo, cierre de limitaciones item 5): mismos campos que connections.update. */
    "connections.update-for-client": {
      payload: {
        clientId: string;
        id: string;
        name?: string;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
      };
      result: Connection;
    };
    "connections.delete-for-client": {
      payload: { clientId: string; id: string };
      result: { deleted: true };
    };
    /** Asignación explícita cliente↔proyecto (encargo: "nunca automática"): concede la capacidad fija `client-connection.use` al proyecto indicado. */
    "connections.assign-to-project": {
      payload: { clientId: string; connectionId: string; projectId: string };
      result: { assigned: true };
    };
    "connections.revoke-from-project": {
      payload: { clientId: string; connectionId: string; projectId: string };
      result: { revoked: true };
    };
    "connections.projects-for-client-connection": {
      payload: { clientId: string; connectionId: string };
      result: readonly string[];
    };

    // -----------------------------------------------------------------
    // connections.*-global — conexiones/MCP GLOBALES reutilizables
    // (client-workflow-v2, cierre de bloqueos funcionales, objetivo 3).
    // Mismo ConnectionsManager, mismo modelo de datos, mismo sistema de
    // grants que connections.*-for-client — solo cambia la raíz de
    // persistencia (global, sin cliente concreto).
    // -----------------------------------------------------------------
    "connections.list-global": { payload: Record<string, never>; result: Connection[] };
    "connections.create-global": {
      payload: {
        name: string;
        type: ConnectionType;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
        enabled?: boolean;
      };
      result: Connection;
    };
    "connections.test-global": { payload: { id: string }; result: ConnectionTestResult };
    "connections.update-global": {
      payload: {
        id: string;
        name?: string;
        config?: SafeConnectionConfig;
        capabilities?: readonly string[];
        secrets?: Readonly<Record<string, string>>;
      };
      result: Connection;
    };
    "connections.delete-global": { payload: { id: string }; result: { deleted: true } };

    "connection-profiles.list": { payload: { projectId: string }; result: ConnectionProfile[] };
    "connection-profiles.get": {
      payload: { projectId: string; id: string };
      result: ConnectionProfile | undefined;
    };
    "connection-profiles.create": {
      payload: { projectId: string; name: string; connectionIds?: readonly string[] };
      result: ConnectionProfile;
    };
    "connection-profiles.update": {
      payload: { projectId: string; id: string; name?: string; connectionIds?: readonly string[] };
      result: ConnectionProfile;
    };
    "connection-profiles.activate": {
      payload: { projectId: string; id: string };
      result: ConnectionProfile;
    };
    "connection-profiles.duplicate": {
      payload: { projectId: string; id: string; name: string };
      result: ConnectionProfile;
    };
    "connection-profiles.archive": {
      payload: { projectId: string; id: string };
      result: ConnectionProfile;
    };
    "connection-profiles.delete": {
      payload: { projectId: string; id: string };
      result: { deleted: true };
    };

    "mcp.list": { payload: { projectId: string }; result: McpServerDefinition[] };
    "mcp.get": {
      payload: { projectId: string; id: string };
      result: McpServerDefinition | undefined;
    };
    "mcp.register": {
      payload: {
        projectId: string;
        connectionId: string;
        name: string;
        transport: "stdio" | "http";
        command?: string;
        args?: readonly string[];
        endpoint?: string;
        timeoutMs?: number;
        capabilities?: readonly string[];
      };
      result: McpServerDefinition;
    };
    "mcp.update": {
      payload: {
        projectId: string;
        id: string;
        name?: string;
        command?: string;
        args?: readonly string[];
        endpoint?: string;
        timeoutMs?: number;
        capabilities?: readonly string[];
        enabled?: boolean;
      };
      result: McpServerDefinition;
    };
    "mcp.test": { payload: { projectId: string; id: string }; result: ConnectionTestResult };
    "mcp.connect": { payload: { projectId: string; id: string }; result: McpServerDefinition };
    "mcp.disconnect": { payload: { projectId: string; id: string }; result: McpServerDefinition };
    "mcp.discover": { payload: { projectId: string; id: string }; result: McpServerDefinition };
    "mcp.tools": {
      payload: { projectId: string; id: string };
      result: McpServerDefinition["discoveredTools"];
    };
    "mcp.resources": {
      payload: { projectId: string; id: string };
      result: McpServerDefinition["discoveredResources"];
    };
    "mcp.prompts": {
      payload: { projectId: string; id: string };
      result: McpServerDefinition["discoveredPrompts"];
    };
    "mcp.archive": { payload: { projectId: string; id: string }; result: McpServerDefinition };
    "mcp.delete": { payload: { projectId: string; id: string }; result: { deleted: true } };
  }
}

function invalidPayload(message: string): never {
  throw createApplicationError({
    code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
    message,
    origin: "validation",
    category: "validation",
    retryable: false,
    recoverable: true,
  });
}

/** `config` es un objeto plano de valores seguros (no secretos): string, number, boolean o array de strings. */
function optionalSafeConfig(
  record: Record<string, unknown>,
  key: string
): SafeConnectionConfig | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidPayload(`El campo "${key}" debe ser un objeto si se proporciona.`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of entries) {
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean" ||
      (Array.isArray(v) && v.every((item) => typeof item === "string"))
    ) {
      result[k] = v as string | number | boolean | string[];
      continue;
    }
    invalidPayload(`El campo "${key}.${k}" tiene un tipo no soportado.`);
  }
  return result;
}

/** `secrets` son valores en claro que el propio manager persiste vía @dwm/secrets; aquí solo se valida la forma. */
function optionalSecretsRecord(
  record: Record<string, unknown>,
  key: string
): Readonly<Record<string, string>> | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidPayload(`El campo "${key}" debe ser un objeto de cadenas si se proporciona.`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const result: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (typeof v !== "string" || v.length === 0) {
      invalidPayload(`El campo "${key}.${k}" debe ser una cadena no vacía.`);
    }
    result[k] = v;
  }
  return result;
}

/**
 * Módulo 36 — controlador de los recursos `connections`,
 * `connection-profiles` y `mcp`. Delega exclusivamente en
 * `@dwm/connections-manager`; igual que `DeliveryController`, es el
 * único responsable de resolver `projectId` → `projectPath` a través de
 * `@dwm/project` antes de delegar. Nunca persiste ni registra un valor
 * de secreto: `secrets` solo viaja de la petición al manager, que lo
 * cambia inmediatamente por una referencia de `@dwm/secrets`.
 */
export class ConnectionsController implements ApplicationController {
  readonly resource = "connections";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const manager = () => requireDependency(this.context.connectionsManager, "connections-manager");
    const projects = () => requireDependency(this.context.projectManager, "project");

    const resolveProjectPath = (projectManager: ProjectManager, projectId: string): string => {
      const project = projectManager.getProject(projectId);
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

    const projectPathFor = (projectId: string): string => resolveProjectPath(projects(), projectId);

    const CLIENT_CONNECTION_USE_CAPABILITY = "client-connection.use";

    /**
     * Raíz de persistencia de las conexiones COMPARTIDAS de un cliente:
     * mismo ConnectionsManager que las de proyecto, solo cambia la
     * carpeta. No requiere que el cliente exista todavía como fichero
     * (`ConnectionsManager` no lo necesita: solo necesita una ruta de
     * carpeta válida para leer/escribir sus propios `.kilo/connections`).
     */
    const clientConnectionsRootFor = (clientId: string): string => {
      const active = requireDependency(
        this.context.portableWorkspaceManager,
        "portable-workspace-manager"
      ).getActiveWorkspace();
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
      return path.join(active.root, "CLIENTES", ".connections", clientId);
    };

    /**
     * Raíz de persistencia de las conexiones/MCP GLOBALES, reutilizables
     * desde cualquier perfil o cliente (client-workflow-v2, cierre de
     * bloqueos funcionales, objetivo 3). Mismo ConnectionsManager que
     * las de cliente/proyecto — solo cambia la carpeta: no hay ningún
     * cliente concreto como espacio de nombres.
     */
    const GLOBAL_CONNECTIONS_NAMESPACE = "global";
    const globalConnectionsRoot = (): string => {
      const active = requireDependency(
        this.context.portableWorkspaceManager,
        "portable-workspace-manager"
      ).getActiveWorkspace();
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
      return path.join(active.root, ".connections", "global");
    };

    /** Mismo Workspace activo que `clientConnectionsRootFor`, sin el sufijo de carpeta — para "Registrar en Actividad" (item 3). */
    const activeWorkspaceRootFor = (): string | undefined =>
      this.context.portableWorkspaceManager?.getActiveWorkspace()?.root;

    // -----------------------------------------------------------------
    // connections.*
    // -----------------------------------------------------------------

    permissions.register("connections.list", ["read"]);
    operations.register({
      name: "connections.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId") };
      },
      handler: async (payload) => manager().list(projectPathFor(payload.projectId)),
    });

    permissions.register("connections.get", ["read"]);
    operations.register({
      name: "connections.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => manager().get(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.create", ["write"]);
    operations.register({
      name: "connections.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const projectId = requireString(record, "projectId");
        const name = requireString(record, "name");
        const type = record["type"];
        if (!isConnectionType(type)) {
          invalidPayload(`El campo "type" no es un tipo de conexión soportado: "${String(type)}".`);
        }
        return {
          projectId,
          name,
          type: type as ConnectionType,
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
          ...(optionalStringArray(record, "profileIds") !== undefined
            ? { profileIds: optionalStringArray(record, "profileIds")! }
            : {}),
          ...(optionalBoolean(record, "enabled") !== undefined
            ? { enabled: optionalBoolean(record, "enabled")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const projectPath = projectPathFor(payload.projectId);
        return manager().create(projectPath, payload);
      },
    });

    permissions.register("connections.update", ["write"]);
    operations.register({
      name: "connections.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
          ...(optionalStringArray(record, "profileIds") !== undefined
            ? { profileIds: optionalStringArray(record, "profileIds")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const projectPath = projectPathFor(payload.projectId);
        const { projectId: _projectId, id, ...rest } = payload;
        return manager().update(projectPath, id, rest);
      },
    });

    permissions.register("connections.test", ["read", "execute"]);
    operations.register({
      name: "connections.test",
      version: "1.0.0",
      capabilities: ["read", "execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => manager().test(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.enable", ["write"]);
    operations.register({
      name: "connections.enable",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().setEnabled(projectPathFor(payload.projectId), payload.id, true),
    });

    permissions.register("connections.disable", ["write"]);
    operations.register({
      name: "connections.disable",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().setEnabled(projectPathFor(payload.projectId), payload.id, false),
    });

    permissions.register("connections.archive", ["write", "archive"], { destructive: true });
    operations.register({
      name: "connections.archive",
      version: "1.0.0",
      capabilities: ["write", "archive"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => manager().archive(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.restore", ["write"]);
    operations.register({
      name: "connections.restore",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => manager().restore(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.delete", ["write", "delete"], { destructive: true });
    operations.register({
      name: "connections.delete",
      version: "1.0.0",
      capabilities: ["write", "delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        await manager().delete(projectPathFor(payload.projectId), payload.id);
        return { deleted: true as const };
      },
    });

    permissions.register("connections.capabilities", ["read"]);
    operations.register({
      name: "connections.capabilities",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().listConnectionCapabilities(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.grants", ["read"]);
    operations.register({
      name: "connections.grants",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().listGrants(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connections.assign-capability", ["write", "configure"]);
    operations.register({
      name: "connections.assign-capability",
      version: "1.0.0",
      capabilities: ["write", "configure"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          granteeId: requireString(record, "granteeId"),
          capability: requireString(record, "capability"),
        };
      },
      handler: async (payload) => {
        await manager().assignCapability(
          projectPathFor(payload.projectId),
          payload.id,
          payload.granteeId,
          payload.capability
        );
        return { assigned: true as const };
      },
    });

    permissions.register("connections.revoke-capability", ["write", "configure"]);
    operations.register({
      name: "connections.revoke-capability",
      version: "1.0.0",
      capabilities: ["write", "configure"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          granteeId: requireString(record, "granteeId"),
          capability: requireString(record, "capability"),
        };
      },
      handler: async (payload) => {
        await manager().revokeCapability(
          projectPathFor(payload.projectId),
          payload.id,
          payload.granteeId,
          payload.capability
        );
        return { revoked: true as const };
      },
    });

    // -----------------------------------------------------------------
    // connection-profiles.*
    // -----------------------------------------------------------------

    permissions.register("connection-profiles.list", ["read"]);
    operations.register({
      name: "connection-profiles.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId") };
      },
      handler: async (payload) => manager().profiles.list(projectPathFor(payload.projectId)),
    });

    permissions.register("connection-profiles.get", ["read"]);
    operations.register({
      name: "connection-profiles.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().profiles.get(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connection-profiles.create", ["write"]);
    operations.register({
      name: "connection-profiles.create",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          name: requireString(record, "name"),
          ...(optionalStringArray(record, "connectionIds") !== undefined
            ? { connectionIds: optionalStringArray(record, "connectionIds")! }
            : {}),
        };
      },
      handler: async (payload) =>
        manager().profiles.create(
          projectPathFor(payload.projectId),
          payload.projectId,
          payload.name,
          payload.connectionIds ?? []
        ),
    });

    permissions.register("connection-profiles.update", ["write"]);
    operations.register({
      name: "connection-profiles.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalStringArray(record, "connectionIds") !== undefined
            ? { connectionIds: optionalStringArray(record, "connectionIds")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const { projectId, id, ...changes } = payload;
        return manager().profiles.update(projectPathFor(projectId), id, changes);
      },
    });

    permissions.register("connection-profiles.activate", ["write"]);
    operations.register({
      name: "connection-profiles.activate",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().profiles.activate(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connection-profiles.duplicate", ["write"]);
    operations.register({
      name: "connection-profiles.duplicate",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          name: requireString(record, "name"),
        };
      },
      handler: async (payload) =>
        manager().profiles.duplicate(projectPathFor(payload.projectId), payload.id, payload.name),
    });

    permissions.register("connection-profiles.archive", ["write", "archive"]);
    operations.register({
      name: "connection-profiles.archive",
      version: "1.0.0",
      capabilities: ["write", "archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().profiles.archive(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("connection-profiles.delete", ["write", "delete"], { destructive: true });
    operations.register({
      name: "connection-profiles.delete",
      version: "1.0.0",
      capabilities: ["write", "delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        await manager().profiles.delete(projectPathFor(payload.projectId), payload.id);
        return { deleted: true as const };
      },
    });

    // -----------------------------------------------------------------
    // mcp.*
    // -----------------------------------------------------------------

    permissions.register("mcp.list", ["read"]);
    operations.register({
      name: "mcp.list",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId") };
      },
      handler: async (payload) => manager().listMcpServers(projectPathFor(payload.projectId)),
    });

    permissions.register("mcp.get", ["read"]);
    operations.register({
      name: "mcp.get",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().getMcpServer(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("mcp.register", ["write"]);
    operations.register({
      name: "mcp.register",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const transport = record["transport"];
        if (transport !== "stdio" && transport !== "http") {
          invalidPayload('El campo "transport" debe ser "stdio" o "http".');
        }
        return {
          projectId: requireString(record, "projectId"),
          connectionId: requireString(record, "connectionId"),
          name: requireString(record, "name"),
          transport: transport as "stdio" | "http",
          ...(optionalString(record, "command") !== undefined
            ? { command: optionalString(record, "command")! }
            : {}),
          ...(optionalStringArray(record, "args") !== undefined
            ? { args: optionalStringArray(record, "args")! }
            : {}),
          ...(optionalString(record, "endpoint") !== undefined
            ? { endpoint: optionalString(record, "endpoint")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const projectPath = projectPathFor(payload.projectId);
        return manager().registerMcpServer(projectPath, payload);
      },
    });

    permissions.register("mcp.update", ["write"]);
    operations.register({
      name: "mcp.update",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          projectId: requireString(record, "projectId"),
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalString(record, "command") !== undefined
            ? { command: optionalString(record, "command")! }
            : {}),
          ...(optionalStringArray(record, "args") !== undefined
            ? { args: optionalStringArray(record, "args")! }
            : {}),
          ...(optionalString(record, "endpoint") !== undefined
            ? { endpoint: optionalString(record, "endpoint")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalBoolean(record, "enabled") !== undefined
            ? { enabled: optionalBoolean(record, "enabled")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const { projectId, id, ...changes } = payload;
        return manager().updateMcpServer(projectPathFor(projectId), id, changes);
      },
    });

    permissions.register("mcp.test", ["read", "execute"]);
    operations.register({
      name: "mcp.test",
      version: "1.0.0",
      capabilities: ["read", "execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        const projectPath = projectPathFor(payload.projectId);
        const server = await manager().getMcpServer(projectPath, payload.id);
        if (!server) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: `No existe ningún servidor MCP con id "${payload.id}".`,
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        return manager().test(projectPath, server.connectionId);
      },
    });

    permissions.register("mcp.connect", ["write", "execute"], { destructive: false });
    operations.register({
      name: "mcp.connect",
      version: "1.0.0",
      capabilities: ["write", "execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().discoverMcpServer(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("mcp.disconnect", ["write"]);
    operations.register({
      name: "mcp.disconnect",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().disconnectMcpServer(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("mcp.discover", ["write", "execute"]);
    operations.register({
      name: "mcp.discover",
      version: "1.0.0",
      capabilities: ["write", "execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().discoverMcpServer(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("mcp.tools", ["read"]);
    operations.register({
      name: "mcp.tools",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => (await this.requireServer(payload)).discoveredTools,
    });

    permissions.register("mcp.resources", ["read"]);
    operations.register({
      name: "mcp.resources",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => (await this.requireServer(payload)).discoveredResources,
    });

    permissions.register("mcp.prompts", ["read"]);
    operations.register({
      name: "mcp.prompts",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => (await this.requireServer(payload)).discoveredPrompts,
    });

    permissions.register("mcp.archive", ["write", "archive"]);
    operations.register({
      name: "mcp.archive",
      version: "1.0.0",
      capabilities: ["write", "archive"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) =>
        manager().archiveMcpServer(projectPathFor(payload.projectId), payload.id),
    });

    permissions.register("mcp.delete", ["write", "delete"], { destructive: true });
    operations.register({
      name: "mcp.delete",
      version: "1.0.0",
      capabilities: ["write", "delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { projectId: requireString(record, "projectId"), id: requireString(record, "id") };
      },
      handler: async (payload) => {
        await manager().deleteMcpServer(projectPathFor(payload.projectId), payload.id);
        return { deleted: true as const };
      },
    });

    // -----------------------------------------------------------------
    // connections.*-for-client — conexiones compartidas de CLIENTE
    // (client-workflow-v2, Commit 5). Mismo manager que arriba.
    // -----------------------------------------------------------------

    permissions.register("connections.list-for-client", ["read"]);
    operations.register({
      name: "connections.list-for-client",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { clientId: requireString(record, "clientId") };
      },
      handler: async (payload) => manager().list(clientConnectionsRootFor(payload.clientId)),
    });

    permissions.register("connections.create-for-client", ["write"]);
    operations.register({
      name: "connections.create-for-client",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const clientId = requireString(record, "clientId");
        const name = requireString(record, "name");
        const type = record["type"];
        if (!isConnectionType(type)) {
          invalidPayload(`El campo "type" no es un tipo de conexión soportado: "${String(type)}".`);
        }
        return {
          clientId,
          name,
          type: type as ConnectionType,
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
          ...(optionalBoolean(record, "enabled") !== undefined
            ? { enabled: optionalBoolean(record, "enabled")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const root = clientConnectionsRootFor(payload.clientId);
        // El manager solo usa "projectId" como espacio de nombres para los
        // secretos (@dwm/secrets); aquí el espacio de nombres es el propio
        // cliente — no representa un proyecto real.
        const connection = await manager().create(root, {
          ...payload,
          projectId: payload.clientId,
        });
        const isMcp = payload.type === "mcp-stdio" || payload.type === "mcp-remote";
        const activityRoot = activeWorkspaceRootFor();
        if (activityRoot) {
          await appendClientActivity(activityRoot, payload.clientId, {
            type: isMcp ? "mcp.registered" : "connection.created",
            message: isMcp
              ? `Servidor MCP «${payload.name}» registrado.`
              : `Conexión «${payload.name}» (${payload.type}) creada.`,
            relatedConnectionId: connection.id,
          }).catch(() => {});
        }
        return connection;
      },
    });

    permissions.register("connections.test-for-client", ["execute"]);
    operations.register({
      name: "connections.test-for-client",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          id: requireString(record, "id"),
        };
      },
      handler: async (payload) => {
        const result = await manager().test(clientConnectionsRootFor(payload.clientId), payload.id);
        const activityRoot = activeWorkspaceRootFor();
        if (activityRoot) {
          await appendClientActivity(activityRoot, payload.clientId, {
            type: "connection.tested",
            message: `Conexión probada: ${result.success ? "correcta" : "fallida"}.`,
            relatedConnectionId: payload.id,
          }).catch(() => {});
        }
        return result;
      },
    });

    permissions.register("connections.update-for-client", ["write"]);
    operations.register({
      name: "connections.update-for-client",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const root = clientConnectionsRootFor(payload.clientId);
        const { clientId: _clientId, id, ...rest } = payload;
        return manager().update(root, id, rest);
      },
    });

    permissions.register("connections.delete-for-client", ["delete"], { destructive: true });
    operations.register({
      name: "connections.delete-for-client",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          id: requireString(record, "id"),
        };
      },
      handler: async (payload) => {
        await manager().delete(clientConnectionsRootFor(payload.clientId), payload.id);
        return { deleted: true as const };
      },
    });

    permissions.register("connections.assign-to-project", ["configure"]);
    operations.register({
      name: "connections.assign-to-project",
      version: "1.0.0",
      capabilities: ["configure"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          connectionId: requireString(record, "connectionId"),
          projectId: requireString(record, "projectId"),
        };
      },
      handler: async (payload) => {
        // La asignación cliente↔proyecto nunca es automática (encargo): se
        // valida aquí que el proyecto exista de verdad antes de concederle
        // capacidad alguna sobre la conexión del cliente.
        projectPathFor(payload.projectId);
        await manager().assignCapability(
          clientConnectionsRootFor(payload.clientId),
          payload.connectionId,
          payload.projectId,
          CLIENT_CONNECTION_USE_CAPABILITY
        );
        const activityRoot = activeWorkspaceRootFor();
        if (activityRoot) {
          await appendClientActivity(activityRoot, payload.clientId, {
            type: "connection.assigned",
            message: `Conexión asignada al proyecto "${payload.projectId}".`,
            relatedConnectionId: payload.connectionId,
            relatedProjectId: payload.projectId,
          }).catch(() => {});
        }
        return { assigned: true as const };
      },
    });

    permissions.register("connections.revoke-from-project", ["configure"]);
    operations.register({
      name: "connections.revoke-from-project",
      version: "1.0.0",
      capabilities: ["configure"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          connectionId: requireString(record, "connectionId"),
          projectId: requireString(record, "projectId"),
        };
      },
      handler: async (payload) => {
        await manager().revokeCapability(
          clientConnectionsRootFor(payload.clientId),
          payload.connectionId,
          payload.projectId,
          CLIENT_CONNECTION_USE_CAPABILITY
        );
        return { revoked: true as const };
      },
    });

    permissions.register("connections.projects-for-client-connection", ["read"]);
    operations.register({
      name: "connections.projects-for-client-connection",
      version: "1.0.0",
      capabilities: ["read"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          clientId: requireString(record, "clientId"),
          connectionId: requireString(record, "connectionId"),
        };
      },
      handler: async (payload) => {
        const grants = await manager().listGrants(
          clientConnectionsRootFor(payload.clientId),
          payload.connectionId
        );
        return grants
          .filter((grant) => grant.capability === CLIENT_CONNECTION_USE_CAPABILITY)
          .map((grant) => grant.granteeId);
      },
    });

    // -----------------------------------------------------------------
    // connections.*-global (client-workflow-v2, objetivo 3). Mismo
    // manager de arriba; ninguna instancia ni sistema nuevo.
    // -----------------------------------------------------------------

    permissions.register("connections.list-global", ["read"]);
    operations.register({
      name: "connections.list-global",
      version: "1.0.0",
      capabilities: ["read"],
      handler: async () => manager().list(globalConnectionsRoot()),
    });

    permissions.register("connections.create-global", ["write"]);
    operations.register({
      name: "connections.create-global",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const name = requireString(record, "name");
        const type = record["type"];
        if (!isConnectionType(type)) {
          invalidPayload(`El campo "type" no es un tipo de conexión soportado: "${String(type)}".`);
        }
        return {
          name,
          type: type as ConnectionType,
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
          ...(optionalBoolean(record, "enabled") !== undefined
            ? { enabled: optionalBoolean(record, "enabled")! }
            : {}),
        };
      },
      handler: async (payload) =>
        // El manager solo usa "projectId" como espacio de nombres para los
        // secretos (@dwm/secrets); aquí el espacio de nombres es el global
        // fijo — no representa un proyecto ni un cliente real.
        manager().create(globalConnectionsRoot(), {
          ...payload,
          projectId: GLOBAL_CONNECTIONS_NAMESPACE,
        }),
    });

    permissions.register("connections.test-global", ["execute"]);
    operations.register({
      name: "connections.test-global",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => manager().test(globalConnectionsRoot(), payload.id),
    });

    permissions.register("connections.update-global", ["write"]);
    operations.register({
      name: "connections.update-global",
      version: "1.0.0",
      capabilities: ["write"],
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return {
          id: requireString(record, "id"),
          ...(optionalString(record, "name") !== undefined
            ? { name: optionalString(record, "name")! }
            : {}),
          ...(optionalSafeConfig(record, "config") !== undefined
            ? { config: optionalSafeConfig(record, "config")! }
            : {}),
          ...(optionalStringArray(record, "capabilities") !== undefined
            ? { capabilities: optionalStringArray(record, "capabilities")! }
            : {}),
          ...(optionalSecretsRecord(record, "secrets") !== undefined
            ? { secrets: optionalSecretsRecord(record, "secrets")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const { id, ...rest } = payload;
        return manager().update(globalConnectionsRoot(), id, rest);
      },
    });

    permissions.register("connections.delete-global", ["delete"], { destructive: true });
    operations.register({
      name: "connections.delete-global",
      version: "1.0.0",
      capabilities: ["delete"],
      destructive: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        return { id: requireString(record, "id") };
      },
      handler: async (payload) => {
        await manager().delete(globalConnectionsRoot(), payload.id);
        return { deleted: true as const };
      },
    });
  }

  private async requireServer(payload: {
    projectId: string;
    id: string;
  }): Promise<McpServerDefinition> {
    const manager = requireDependency(this.context.connectionsManager, "connections-manager");
    const projectManager = requireDependency(this.context.projectManager, "project");
    const project = projectManager.getProject(payload.projectId);
    if (!project) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
        message: `No existe ningún proyecto con id "${payload.projectId}".`,
        origin: "validation",
        category: "not-found",
        retryable: false,
        recoverable: true,
      });
    }
    const server = await manager.getMcpServer(project.configuration.projectPath, payload.id);
    if (!server) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
        message: `No existe ningún servidor MCP con id "${payload.id}".`,
        origin: "validation",
        category: "not-found",
        retryable: false,
        recoverable: true,
      });
    }
    return server;
  }
}
