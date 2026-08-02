import { randomUUID } from "node:crypto";
import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { SecretsManager } from "@dwm/secrets";
import {
  isConnectionType,
  type Connection,
  type ConnectionGrant,
  type ConnectionStatus,
  type ConnectionTestResult,
  type ConnectionType,
  type CreateConnectionRequest,
  type McpServerDefinition,
  type McpTransport,
  type SecretReferences,
  type UpdateConnectionRequest,
} from "./ConnectionTypes.js";
import { ConnectionValidator } from "./ConnectionValidator.js";
import { ConnectionRepository } from "./ConnectionRepository.js";
import { ConnectionRegistry } from "./ConnectionRegistry.js";
import {
  ConnectionAdapterRegistry,
  type ConnectionAdapterRegistryOptions,
} from "./ConnectionAdapterRegistry.js";
import { ConnectionTester, type ConnectionTestOptions } from "./ConnectionTester.js";
import { ConnectionCapabilityManager } from "./ConnectionCapabilityManager.js";
import { ConnectionProfileManager } from "./ConnectionProfileManager.js";
import { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";
import { createConnectionError } from "./errors/ConnectionError.js";

export interface ConnectionsManagerOptions {
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  /** Único punto de resolución/almacenamiento de valores de secreto; nunca duplicado por este manager. */
  readonly secretsManager?: SecretsManager;
  readonly adapterRegistryOptions?: ConnectionAdapterRegistryOptions;
}

type ConnectionEventPhase =
  | "created"
  | "updated"
  | "tested"
  | "enabled"
  | "disabled"
  | "archived"
  | "restored"
  | "deleted"
  | "capability.assigned"
  | "capability.revoked"
  | "mcp.registered"
  | "mcp.updated"
  | "mcp.discovered"
  | "mcp.archived"
  | "mcp.deleted";

/**
 * Módulo 36 — Connections & MCP Manager. Permite que cada proyecto
 * recuerde y administre sus conexiones externas de forma segura: las
 * conexiones pertenecen siempre a un proyecto concreto (identificado por
 * `projectPath`, README "Proyecto y .kilo"), nunca al cliente ni al
 * Workspace global. No guarda ningún valor de secreto: solo referencias
 * a `@dwm/secrets`, reutilizando una única instancia inyectada — este
 * manager nunca crea su propia instancia de Secrets Manager. Implementa
 * `IModule`, integrándose con el resto del Engine solo a través de sus
 * APIs públicas.
 */
export class ConnectionsManager implements IModule {
  readonly id = "connections-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly validator: ConnectionValidator = new ConnectionValidator();
  private readonly repository = new ConnectionRepository();
  private readonly registry = new ConnectionRegistry();
  private readonly adapterRegistry: ConnectionAdapterRegistry;
  private readonly tester: ConnectionTester;
  readonly capabilities: ConnectionCapabilityManager;
  readonly profiles: ConnectionProfileManager;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly secretsManager?: SecretsManager;

  constructor(options: ConnectionsManagerOptions = {}) {
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    this.adapterRegistry = new ConnectionAdapterRegistry(options.adapterRegistryOptions ?? {});
    this.tester = new ConnectionTester(this.adapterRegistry, this.secretsManager);
    this.capabilities = new ConnectionCapabilityManager(this.repository);
    this.profiles = new ConnectionProfileManager(this.repository);
  }

  // -----------------------------------------------------------------
  // Connections CRUD
  // -----------------------------------------------------------------

  async list(projectPath: string): Promise<Connection[]> {
    this.validator.assertValidProjectPath(projectPath);
    const cached = this.registry.get(projectPath);
    if (cached) return cached;
    const connections = await this.repository.readConnections(projectPath);
    this.registry.set(projectPath, connections);
    return connections;
  }

  async get(projectPath: string, id: string): Promise<Connection | undefined> {
    const connections = await this.list(projectPath);
    return connections.find((c) => c.id === id);
  }

  async create(projectPath: string, request: CreateConnectionRequest): Promise<Connection> {
    this.validator.assertValidProjectPath(projectPath);
    this.validator.assertValidCreateRequest(request);

    const connections = await this.list(projectPath);
    if (connections.some((c) => c.name === request.name && c.status !== "archived")) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_ALREADY_EXISTS,
        message: `Ya existe una conexión activa con el nombre "${request.name}" en este proyecto.`,
        origin: "name",
        recoverable: true,
      });
    }

    const secretReferences = await this.persistSecrets(
      request.projectId,
      request.name,
      request.secrets
    );
    const adapterAvailable = this.adapterRegistry.isAvailable(request.type);
    const now = new Date().toISOString();
    const connection: Connection = {
      id: randomUUID(),
      projectId: request.projectId,
      name: request.name,
      type: request.type,
      profileIds: request.profileIds ?? [],
      status: adapterAvailable ? "unconfigured" : "adapter-unavailable",
      enabled: request.enabled ?? true,
      capabilities: request.capabilities ?? [],
      secretReferences,
      config: request.config ?? {},
      adapterId: this.adapterRegistry.get(request.type)?.adapterId ?? null,
      createdAt: now,
      updatedAt: now,
      lastTestAt: null,
      lastSuccessfulTestAt: null,
      lastError: null,
      metadata: { dwm: {} },
    };

    await this.persist(projectPath, [...connections, connection]);
    await this.notify("created", connection.id);
    return connection;
  }

  async update(
    projectPath: string,
    id: string,
    request: UpdateConnectionRequest
  ): Promise<Connection> {
    this.validator.assertValidUpdateRequest(request);
    const connections = await this.list(projectPath);
    const index = connections.findIndex((c) => c.id === id);
    if (index === -1) throw this.notFound(id);
    const existing = connections[index]!;

    const newSecretRefs = request.secrets
      ? await this.persistSecrets(existing.projectId, existing.name, request.secrets)
      : {};

    const updated: Connection = {
      ...existing,
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.config !== undefined ? { config: request.config } : {}),
      ...(request.capabilities !== undefined ? { capabilities: request.capabilities } : {}),
      ...(request.profileIds !== undefined ? { profileIds: request.profileIds } : {}),
      secretReferences: { ...existing.secretReferences, ...newSecretRefs },
      updatedAt: new Date().toISOString(),
    };
    const next = [...connections];
    next[index] = updated;
    await this.persist(projectPath, next);
    await this.notify("updated", id);
    return updated;
  }

  async setEnabled(projectPath: string, id: string, enabled: boolean): Promise<Connection> {
    const updated = await this.transition(projectPath, id, (c) => ({
      ...c,
      enabled,
      status: enabled ? c.status : ("disabled" as ConnectionStatus),
    }));
    await this.notify(enabled ? "enabled" : "disabled", id);
    return updated;
  }

  async archive(projectPath: string, id: string): Promise<Connection> {
    const updated = await this.transition(projectPath, id, (c) => ({
      ...c,
      status: "archived" as ConnectionStatus,
      enabled: false,
    }));
    await this.adapterRegistry.get(updated.type)?.dispose?.(id);
    await this.notify("archived", id);
    return updated;
  }

  async restore(projectPath: string, id: string): Promise<Connection> {
    const updated = await this.transition(projectPath, id, (c) => ({
      ...c,
      status: "ready" as ConnectionStatus,
    }));
    await this.notify("restored", id);
    return updated;
  }

  /** Eliminación destructiva; el controlador es responsable de exigir confirmación antes de llamar. */
  async delete(projectPath: string, id: string): Promise<void> {
    const connections = await this.list(projectPath);
    const target = connections.find((c) => c.id === id);
    if (!target) throw this.notFound(id);
    await this.adapterRegistry.get(target.type)?.dispose?.(id);
    await this.capabilities.clearForConnection(projectPath, id);
    await this.persist(
      projectPath,
      connections.filter((c) => c.id !== id)
    );
    await this.notify("deleted", id);
  }

  // -----------------------------------------------------------------
  // Capabilities
  // -----------------------------------------------------------------

  async listConnectionCapabilities(projectPath: string, id: string): Promise<readonly string[]> {
    const connection = await this.get(projectPath, id);
    if (!connection) throw this.notFound(id);
    return connection.capabilities;
  }

  async assignCapability(
    projectPath: string,
    connectionId: string,
    granteeId: string,
    capability: string
  ): Promise<void> {
    this.validator.assertValidCapabilities([capability]);
    await this.capabilities.assign(projectPath, connectionId, granteeId, capability);
    await this.notify("capability.assigned", connectionId);
  }

  async revokeCapability(
    projectPath: string,
    connectionId: string,
    granteeId: string,
    capability: string
  ): Promise<void> {
    await this.capabilities.revoke(projectPath, connectionId, granteeId, capability);
    await this.notify("capability.revoked", connectionId);
  }

  async listGrants(projectPath: string, connectionId: string): Promise<ConnectionGrant[]> {
    return this.capabilities.listForConnection(projectPath, connectionId);
  }

  // -----------------------------------------------------------------
  // Test
  // -----------------------------------------------------------------

  async test(
    projectPath: string,
    id: string,
    options: ConnectionTestOptions = {}
  ): Promise<ConnectionTestResult> {
    const connections = await this.list(projectPath);
    const index = connections.findIndex((c) => c.id === id);
    if (index === -1) throw this.notFound(id);
    const existing = connections[index]!;

    const testingSnapshot = [...connections];
    testingSnapshot[index] = { ...existing, status: "testing" as ConnectionStatus };
    await this.persist(projectPath, testingSnapshot);

    const result = await this.tester.test(existing, options);
    const now = new Date().toISOString();
    const afterTest: Connection = {
      ...existing,
      status: result.success ? "connected" : this.statusForFailure(existing.type),
      lastTestAt: now,
      lastSuccessfulTestAt: result.success ? now : existing.lastSuccessfulTestAt,
      lastError: result.error,
      updatedAt: now,
    };
    const finalConnections = [...(await this.list(projectPath))];
    const finalIndex = finalConnections.findIndex((c) => c.id === id);
    if (finalIndex !== -1) finalConnections[finalIndex] = afterTest;
    await this.persist(projectPath, finalConnections);
    await this.notify("tested", id);
    return result;
  }

  private statusForFailure(type: ConnectionType): ConnectionStatus {
    return this.adapterRegistry.isAvailable(type) ? "failed" : "adapter-unavailable";
  }

  // -----------------------------------------------------------------
  // MCP servers
  // -----------------------------------------------------------------

  async listMcpServers(projectPath: string): Promise<McpServerDefinition[]> {
    return this.repository.readMcpServers(projectPath);
  }

  async getMcpServer(projectPath: string, id: string): Promise<McpServerDefinition | undefined> {
    const servers = await this.repository.readMcpServers(projectPath);
    return servers.find((s) => s.id === id);
  }

  async registerMcpServer(
    projectPath: string,
    input: {
      projectId: string;
      connectionId: string;
      name: string;
      transport: McpTransport;
      command?: string;
      args?: readonly string[];
      endpoint?: string;
      envSecretReferences?: SecretReferences;
      timeoutMs?: number;
      capabilities?: readonly string[];
    }
  ): Promise<McpServerDefinition> {
    const now = new Date().toISOString();
    const server: McpServerDefinition = {
      id: randomUUID(),
      projectId: input.projectId,
      connectionId: input.connectionId,
      name: input.name,
      transport: input.transport,
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.args !== undefined ? { args: input.args } : {}),
      ...(input.endpoint !== undefined ? { endpoint: input.endpoint } : {}),
      envSecretReferences: input.envSecretReferences ?? {},
      timeoutMs: input.timeoutMs ?? 10_000,
      capabilities: input.capabilities ?? [],
      enabled: true,
      status: "unconfigured",
      discoveredTools: [],
      discoveredResources: [],
      discoveredPrompts: [],
      createdAt: now,
      updatedAt: now,
    };
    const servers = await this.repository.readMcpServers(projectPath);
    await this.repository.writeMcpServers(projectPath, [...servers, server]);
    await this.notify("mcp.registered", server.id);
    return server;
  }

  async updateMcpServer(
    projectPath: string,
    id: string,
    changes: Partial<
      Pick<
        McpServerDefinition,
        "name" | "command" | "args" | "endpoint" | "timeoutMs" | "capabilities" | "enabled"
      >
    >
  ): Promise<McpServerDefinition> {
    const servers = await this.repository.readMcpServers(projectPath);
    const index = servers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
        message: `No existe ningún servidor MCP con id "${id}".`,
        origin: "mcp",
        recoverable: true,
      });
    }
    const updated: McpServerDefinition = {
      ...servers[index]!,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    const next = [...servers];
    next[index] = updated;
    await this.repository.writeMcpServers(projectPath, next);
    await this.notify("mcp.updated", id);
    return updated;
  }

  async discoverMcpServer(projectPath: string, id: string): Promise<McpServerDefinition> {
    const server = await this.getMcpServer(projectPath, id);
    if (!server) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
        message: `No existe ningún servidor MCP con id "${id}".`,
        origin: "mcp",
        recoverable: true,
      });
    }
    const connection = await this.get(projectPath, server.connectionId);
    if (!connection) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
        message: `La conexión asociada al servidor MCP "${id}" no existe.`,
        origin: "mcp",
        recoverable: true,
      });
    }
    const adapter = this.adapterRegistry.get(connection.type);
    if (!adapter?.discover) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_ADAPTER_UNAVAILABLE,
        message: "El adaptador de esta conexión no soporta descubrimiento MCP.",
        origin: "mcp",
        recoverable: true,
      });
    }
    const resolvedSecrets = await this.tester.resolveSecrets(connection);
    const timeoutMs = server.timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let discovery;
    try {
      discovery = await adapter.discover({
        connection,
        resolvedSecrets,
        timeoutMs,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const updated = await this.updateMcpServerDiscovery(projectPath, id, discovery);
    await this.notify("mcp.discovered", id);
    return updated;
  }

  private async updateMcpServerDiscovery(
    projectPath: string,
    id: string,
    discovery: {
      tools: readonly McpServerDefinition["discoveredTools"][number][];
      resources: readonly McpServerDefinition["discoveredResources"][number][];
      prompts: readonly McpServerDefinition["discoveredPrompts"][number][];
    }
  ): Promise<McpServerDefinition> {
    const servers = await this.repository.readMcpServers(projectPath);
    const index = servers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
        message: `No existe ningún servidor MCP con id "${id}".`,
        origin: "mcp",
        recoverable: true,
      });
    }
    const updated: McpServerDefinition = {
      ...servers[index]!,
      status: "connected",
      discoveredTools: discovery.tools,
      discoveredResources: discovery.resources,
      discoveredPrompts: discovery.prompts,
      updatedAt: new Date().toISOString(),
    };
    const next = [...servers];
    next[index] = updated;
    await this.repository.writeMcpServers(projectPath, next);
    return updated;
  }

  async archiveMcpServer(projectPath: string, id: string): Promise<McpServerDefinition> {
    return this.updateMcpServer(projectPath, id, { enabled: false });
  }

  /** Cierra el proceso/sesión MCP activo de un servidor sin archivarlo (README Application API "mcp.disconnect"). */
  async disconnectMcpServer(projectPath: string, id: string): Promise<McpServerDefinition> {
    const servers = await this.repository.readMcpServers(projectPath);
    const index = servers.findIndex((s) => s.id === id);
    if (index === -1) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
        message: `No existe ningún servidor MCP con id "${id}".`,
        origin: "mcp",
        recoverable: true,
      });
    }
    const server = servers[index]!;
    const connection = await this.get(projectPath, server.connectionId);
    if (connection) {
      await this.adapterRegistry.get(connection.type)?.dispose?.(connection.id);
    }
    const updated: McpServerDefinition = {
      ...server,
      status: "disabled",
      updatedAt: new Date().toISOString(),
    };
    const next = [...servers];
    next[index] = updated;
    await this.repository.writeMcpServers(projectPath, next);
    return updated;
  }

  async deleteMcpServer(projectPath: string, id: string): Promise<void> {
    const servers = await this.repository.readMcpServers(projectPath);
    const target = servers.find((s) => s.id === id);
    if (!target) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_MCP_NOT_FOUND,
        message: `No existe ningún servidor MCP con id "${id}".`,
        origin: "mcp",
        recoverable: true,
      });
    }
    await this.adapterRegistry.getById("mcp-stdio")?.dispose?.(target.connectionId);
    await this.repository.writeMcpServers(
      projectPath,
      servers.filter((s) => s.id !== id)
    );
    await this.notify("mcp.deleted", id);
  }

  // -----------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------

  private async transition(
    projectPath: string,
    id: string,
    fn: (connection: Connection) => Connection
  ): Promise<Connection> {
    const connections = await this.list(projectPath);
    const index = connections.findIndex((c) => c.id === id);
    if (index === -1) throw this.notFound(id);
    const updated = { ...fn(connections[index]!), updatedAt: new Date().toISOString() };
    const next = [...connections];
    next[index] = updated;
    await this.persist(projectPath, next);
    return updated;
  }

  private async persist(projectPath: string, connections: readonly Connection[]): Promise<void> {
    await this.repository.writeConnections(projectPath, connections);
    this.registry.set(projectPath, connections);
  }

  private async persistSecrets(
    projectId: string,
    connectionName: string,
    secrets: Readonly<Record<string, string>> | undefined
  ): Promise<SecretReferences> {
    if (!secrets || Object.keys(secrets).length === 0) return {};
    if (!this.secretsManager) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_SECRET_MISSING,
        message:
          "No hay un Secrets Manager conectado para almacenar las credenciales de la conexión.",
        origin: "secret",
        recoverable: true,
      });
    }
    const references: Record<string, string> = {};
    const safeSlug = (raw: string): string =>
      raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x";
    for (const [name, value] of Object.entries(secrets)) {
      const secretKey = `connections.${safeSlug(projectId)}.${safeSlug(connectionName)}.${safeSlug(name)}.${randomUUID().slice(0, 8)}`;
      await this.secretsManager.createSecret(secretKey, value);
      references[name] = secretKey;
    }
    return references;
  }

  private notFound(id: string) {
    return createConnectionError({
      code: ConnectionErrorCode.CONNECTION_NOT_FOUND,
      message: `No existe ninguna conexión con id "${id}".`,
      origin: "id",
      recoverable: true,
    });
  }

  private async notify(phase: ConnectionEventPhase, subjectId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `connections.${phase}`,
        { id: subjectId },
        { correlationId: subjectId }
      );
    }
    if (this.logger) {
      await this.logger.withCorrelationId(subjectId).info(`connections:${phase} ${subjectId}`);
    }
  }

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();
    context.reportStatus(SystemStatus.OK, "connections-manager inicializado");
  }

  async dispose(): Promise<void> {
    await this.adapterRegistry.disposeAll();
  }
}

export function isKnownConnectionType(value: unknown): value is ConnectionType {
  return isConnectionType(value);
}
