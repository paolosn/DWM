import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { ImportManager } from "@dwm/import-manager";
import type { PSNAdapter } from "@dwm/psn-adapter";
import type { ProjectManager } from "@dwm/project";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { KnowledgeManager } from "@dwm/knowledge-manager";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { ClientRepository } from "./ClientRepository.js";
import { ClientRegistry } from "./ClientRegistry.js";
import { ClientValidator, type ClientValidationResult } from "./ClientValidator.js";
import { ClientMetadataService } from "./ClientMetadata.js";
import { ClientRelations, type ClientReferenceManagers } from "./ClientRelations.js";
import {
  emptyClientReferences,
  normalizeTags,
  type Client,
  type ClientCreateRequest,
  type ClientDeleteOptions,
  type ClientDwmMetadata,
  type ClientFilter,
  type ClientListOptions,
  type ClientReferenceCheck,
  type ClientReferenceKind,
  type ClientSummary,
  type ClientUpdateRequest,
} from "./ClientTypes.js";
import { ClientErrorCode } from "./errors/ClientErrorCode.js";
import { createClientError } from "./errors/ClientError.js";

export interface ClientManagerOptions {
  readonly psnAdapter: PSNAdapter;
  readonly repository?: ClientRepository;
  readonly registry?: ClientRegistry;
  readonly validator?: ClientValidator;
  readonly metadataService?: ClientMetadataService;
  readonly relations?: ClientRelations;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly projectManager?: ProjectManager;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly knowledgeManager?: KnowledgeManager;
  readonly verificationManager?: VerificationManager;
}

type ClientEventPhase =
  | "created"
  | "updated"
  | "deleted"
  | "duplicated"
  | "archived"
  | "restored"
  | "reference.added"
  | "reference.removed";

/**
 * Módulo 27 — Client Manager. Gestiona los clientes reales del
 * Workspace (ficheros JSON dentro del recurso `clientes` que reconoce
 * `@dwm/psn-adapter`), sin base de datos y sin duplicar información de
 * otros módulos: las relaciones con proyectos, conocimiento, agentes,
 * skills y reglas son referencias simples por id, nunca copias de su
 * contenido. No implementa CRM comercial, facturación, contactos
 * avanzados, IA ni sincronización externa — eso queda para módulos
 * posteriores. Archivar y restaurar reescriben únicamente el bloque
 * `dwm` reservado del JSON, de forma no destructiva y sin mover ni
 * renombrar ningún fichero. Implementa `IModule`, integrándose con el
 * resto del Engine únicamente a través de las APIs públicas de
 * `PSNAdapter`, `WorkspaceManager`, `WorkspacePaths`, `ImportManager`,
 * `ProjectManager`, `AgentManager`, `SkillManager`, `RuleManager`,
 * `KnowledgeManager`, `VerificationManager` y `@dwm/status`.
 */
export class ClientManager implements IModule {
  readonly id = "client-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly psnAdapter: PSNAdapter;
  private readonly repository: ClientRepository;
  private readonly registry: ClientRegistry;
  private readonly validator: ClientValidator;
  private readonly metadataService: ClientMetadataService;
  private readonly relations: ClientRelations;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly projectManager?: ProjectManager;
  private readonly agentManager?: AgentManager;
  private readonly skillManager?: SkillManager;
  private readonly ruleManager?: RuleManager;
  private readonly knowledgeManager?: KnowledgeManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: ClientManagerOptions) {
    if (!options || !options.psnAdapter) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_INVALID_REQUEST,
        message:
          "ClientManagerOptions.psnAdapter es obligatorio: es la única vía admitida para localizar los clientes reales del Workspace.",
        origin: "request",
        recoverable: false,
      });
    }
    this.psnAdapter = options.psnAdapter;
    this.repository = options.repository ?? new ClientRepository();
    this.registry = options.registry ?? new ClientRegistry();
    this.validator = options.validator ?? new ClientValidator();
    this.metadataService = options.metadataService ?? new ClientMetadataService();
    this.relations = options.relations ?? new ClientRelations();

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.importManager) this.importManager = options.importManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.ruleManager) this.ruleManager = options.ruleManager;
    if (options.knowledgeManager) this.knowledgeManager = options.knowledgeManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

  async listClients(options: ClientListOptions = {}): Promise<ClientSummary[]> {
    await this.refreshIndex(options.root);
    const summaries = this.registry.list();
    return options.includeArchived ? summaries : summaries.filter((summary) => !summary.archived);
  }

  async getClient(id: string, root?: string): Promise<Client> {
    this.validator.assertValidId(id);
    const directory = this.resolveDirectory(root);
    return this.readExisting(directory, id);
  }

  async getClientMetadata(id: string, root?: string): Promise<ClientDwmMetadata> {
    return (await this.getClient(id, root)).dwm;
  }

  async searchClients(query: string, root?: string): Promise<ClientSummary[]> {
    await this.refreshIndex(root);
    return this.registry.search(query);
  }

  async filterClients(filter: ClientFilter, root?: string): Promise<ClientSummary[]> {
    await this.refreshIndex(root);
    return this.registry.filter(filter);
  }

  async listTags(root?: string): Promise<string[]> {
    await this.refreshIndex(root);
    return this.registry.listTags();
  }

  // ---------------------------------------------------------------------
  // Relaciones
  // ---------------------------------------------------------------------

  async addReference(
    id: string,
    kind: ClientReferenceKind,
    refId: string,
    root?: string
  ): Promise<Client> {
    this.validator.assertValidId(id);
    this.validator.assertValidReferenceKind(kind);
    this.validator.assertValidReferenceId(refId);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);

    const references = this.relations.addReference(existing.references, kind, refId);
    const dwm = this.metadataService.withTouchedTimestamp(existing.dwm);
    const client = await this.persist(directory, { ...existing, references, dwm });
    await this.notify("reference.added", client);
    await this.afterMutation(directory);
    return client;
  }

  async removeReference(
    id: string,
    kind: ClientReferenceKind,
    refId: string,
    root?: string
  ): Promise<Client> {
    this.validator.assertValidId(id);
    this.validator.assertValidReferenceKind(kind);
    this.validator.assertValidReferenceId(refId);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);

    const references = this.relations.removeReference(existing.references, kind, refId);
    const dwm = this.metadataService.withTouchedTimestamp(existing.dwm);
    const client = await this.persist(directory, { ...existing, references, dwm });
    await this.notify("reference.removed", client);
    await this.afterMutation(directory);
    return client;
  }

  /** Detecta referencias inexistentes, únicamente para las categorías cuyo módulo esté integrado (ver `ClientRelations`). */
  async checkReferences(id: string, root?: string): Promise<ClientReferenceCheck> {
    const client = await this.getClient(id, root);
    return this.relations.checkReferences(client.references, this.referenceManagers());
  }

  private referenceManagers(): ClientReferenceManagers {
    return {
      ...(this.projectManager ? { projectManager: this.projectManager } : {}),
      ...(this.knowledgeManager ? { knowledgeManager: this.knowledgeManager } : {}),
      ...(this.agentManager ? { agentManager: this.agentManager } : {}),
      ...(this.skillManager ? { skillManager: this.skillManager } : {}),
      ...(this.ruleManager ? { ruleManager: this.ruleManager } : {}),
    };
  }

  // ---------------------------------------------------------------------
  // Validación de estructura
  // ---------------------------------------------------------------------

  /** Valida la estructura de un cliente ya materializado, sin tocar el disco. */
  validateClientStructure(client: Client): ClientValidationResult {
    return this.validator.validateStructure(client);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  async createClient(request: ClientCreateRequest, root?: string): Promise<Client> {
    this.validator.assertValidId(request.id);
    this.validator.assertValidSlug(request.slug);
    this.validator.assertValidName(request.name);
    this.validator.assertValidDescription(request.description);
    if (request.tags) this.validator.assertValidTags(request.tags);
    if (request.status !== undefined) this.validator.assertValidStatus(request.status);

    const directory = this.resolveDirectory(root);
    await this.refreshIndex(root);

    if (await this.repository.exists(directory, request.id)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_ALREADY_EXISTS,
        message: `Ya existe un cliente con id "${request.id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    if (this.registry.findBySlug(request.slug)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS,
        message: `Ya existe un cliente con slug "${request.slug}".`,
        origin: "registry",
        recoverable: true,
      });
    }

    const client: Client = {
      id: request.id,
      name: request.name,
      slug: request.slug,
      status: request.status ?? "active",
      tags: normalizeTags(request.tags ?? []),
      ...(request.description ? { description: request.description } : {}),
      references: { ...emptyClientReferences(), ...request.references },
      dwm: this.metadataService.createInitial(),
    };
    const created = await this.persist(directory, client);
    await this.notify("created", created);
    await this.afterMutation(directory);
    return created;
  }

  /** Aplica cambios parciales a los campos de negocio de un cliente existente, sin tocar sus referencias. */
  async updateClient(id: string, request: ClientUpdateRequest, root?: string): Promise<Client> {
    this.validator.assertValidId(id);
    if (request.slug !== undefined) this.validator.assertValidSlug(request.slug);
    if (request.name !== undefined) this.validator.assertValidName(request.name);
    if (request.description !== undefined)
      this.validator.assertValidDescription(request.description);
    if (request.tags) this.validator.assertValidTags(request.tags);
    if (request.status !== undefined) this.validator.assertValidStatus(request.status);

    const directory = this.resolveDirectory(root);
    await this.refreshIndex(root);
    const existing = await this.readExisting(directory, id);

    if (request.slug !== undefined && this.registry.findBySlug(request.slug, id)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS,
        message: `Ya existe un cliente con slug "${request.slug}".`,
        origin: "registry",
        recoverable: true,
      });
    }

    const descriptionChanged = request.description !== undefined;
    const nextDescription = descriptionChanged
      ? (request.description ?? undefined)
      : existing.description;
    const { description: _existingDescription, ...withoutDescription } = existing;

    const client: Client = {
      ...withoutDescription,
      name: request.name ?? existing.name,
      slug: request.slug ?? existing.slug,
      status: request.status ?? existing.status,
      tags: request.tags ? normalizeTags(request.tags) : existing.tags,
      ...(nextDescription ? { description: nextDescription } : {}),
      dwm: this.metadataService.withTouchedTimestamp(existing.dwm),
    };
    const updated = await this.persist(directory, client);
    await this.notify("updated", updated);
    await this.afterMutation(directory);
    return updated;
  }

  /** Guarda un cliente ya materializado tal cual (usado cuando quien llama ya tiene el `Client` completo, p. ej. tras editarlo en memoria). */
  async saveClient(client: Client, root?: string): Promise<Client> {
    this.validator.assertValidStructure(client);
    const directory = this.resolveDirectory(root);
    const dwm = this.metadataService.withTouchedTimestamp(client.dwm);
    const saved = await this.persist(directory, { ...client, dwm });
    await this.notify("updated", saved);
    await this.afterMutation(directory);
    return saved;
  }

  async duplicateClient(
    id: string,
    newId: string,
    newSlug: string,
    root?: string
  ): Promise<Client> {
    this.validator.assertValidId(newId);
    this.validator.assertValidSlug(newSlug);
    const directory = this.resolveDirectory(root);
    await this.refreshIndex(root);
    const source = await this.readExisting(directory, id);

    if (await this.repository.exists(directory, newId)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_ALREADY_EXISTS,
        message: `Ya existe un cliente con id "${newId}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    if (this.registry.findBySlug(newSlug)) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_SLUG_ALREADY_EXISTS,
        message: `Ya existe un cliente con slug "${newSlug}".`,
        origin: "registry",
        recoverable: true,
      });
    }

    const duplicate: Client = {
      ...source,
      id: newId,
      slug: newSlug,
      references: emptyClientReferences(),
      dwm: this.metadataService.createInitial(),
    };
    const created = await this.persist(directory, duplicate);
    await this.notify("duplicated", created);
    await this.afterMutation(directory);
    return created;
  }

  /** Elimina un cliente de forma permanente e irreversible. `options.confirmPermanent` debe ser exactamente `true`. */
  async deleteClient(id: string, options: ClientDeleteOptions, root?: string): Promise<void> {
    this.validator.assertValidId(id);
    if (options?.confirmPermanent !== true) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_DELETE_NOT_CONFIRMED,
        message: `La eliminación del cliente "${id}" requiere confirmarse explícitamente con { confirmPermanent: true }.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const directory = this.resolveDirectory(root);
    await this.readExisting(directory, id);

    await this.repository.delete(directory, id);
    this.registry.delete(id);
    await this.notifyById("deleted", id);
    await this.afterMutation(directory);
  }

  async archiveClient(id: string, root?: string): Promise<Client> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (existing.dwm.archived) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_ALREADY_ARCHIVED,
        message: `El cliente "${id}" ya está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const client = await this.persist(directory, {
      ...existing,
      dwm: this.metadataService.withArchived(existing.dwm),
    });
    await this.notify("archived", client);
    await this.afterMutation(directory);
    return client;
  }

  async restoreClient(id: string, root?: string): Promise<Client> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (!existing.dwm.archived) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_NOT_ARCHIVED,
        message: `El cliente "${id}" no está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const client = await this.persist(directory, {
      ...existing,
      dwm: this.metadataService.withRestored(existing.dwm),
    });
    await this.notify("restored", client);
    await this.afterMutation(directory);
    return client;
  }

  // ---------------------------------------------------------------------
  // Resolución del directorio de clientes (vía PSN Adapter)
  // ---------------------------------------------------------------------

  private resolveDirectory(root?: string): string {
    const directory = this.psnAdapter.getResourcePath("clientes", root);
    if (!directory) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_DIRECTORY_UNRESOLVABLE,
        message:
          'No se pudo resolver el directorio de clientes: PSNAdapter no reconoce el recurso "clientes" en el Workspace escaneado. Escanea el Workspace con PSNAdapter.scanWorkspace() primero.',
        origin: "directory",
        recoverable: true,
      });
    }
    return directory;
  }

  /** Lee un cliente que ya se sabe debería existir en `directory` (un directorio ya resuelto, nunca una raíz sin resolver). */
  private async readExisting(directory: string, id: string): Promise<Client> {
    const client = await this.repository.read(directory, id);
    if (!client) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
        message: `No existe ningún cliente con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return client;
  }

  private async refreshIndex(root?: string): Promise<void> {
    const directory = this.resolveDirectory(root);
    const ids = await this.repository.listIds(directory);
    const summaries: ClientSummary[] = [];
    for (const id of ids) {
      const client = await this.repository.read(directory, id);
      if (!client) continue;
      summaries.push(this.toSummary(client));
    }
    this.registry.replaceAll(summaries);
  }

  private async persist(directory: string, client: Client): Promise<Client> {
    await this.repository.write(directory, client);
    this.registry.set(this.toSummary(client));
    return client;
  }

  private toSummary(client: Client): ClientSummary {
    return {
      id: client.id,
      name: client.name,
      slug: client.slug,
      status: client.status,
      tags: client.tags,
      archived: client.dwm.archived,
      createdAt: client.dwm.createdAt,
      updatedAt: client.dwm.updatedAt,
    };
  }

  // ---------------------------------------------------------------------
  // Integraciones
  // ---------------------------------------------------------------------

  listConnectedIntegrations(): string[] {
    const connected: string[] = ["psn-adapter"];
    if (this.workspacePaths) connected.push("portable-workspace");
    if (this.importManager) connected.push("import-manager");
    if (this.workspaceManager) connected.push("workspace");
    if (this.projectManager) connected.push("project");
    if (this.agentManager) connected.push("agent-manager");
    if (this.skillManager) connected.push("skill-manager");
    if (this.ruleManager) connected.push("rule-manager");
    if (this.knowledgeManager) connected.push("knowledge-manager");
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "client-manager",
      getStatus: () => {
        let directory: string | undefined;
        try {
          directory = this.resolveDirectory();
        } catch {
          return makeStatusReport(
            "client-manager",
            "UNKNOWN",
            "Todavía no se puede resolver el directorio de clientes: escanea el Workspace con PSNAdapter primero."
          );
        }
        return makeStatusReport("client-manager", "OK", "client-manager responde correctamente.", {
          directory,
          clients: this.registry.list().length,
        });
      },
    };
  }

  private async afterMutation(directory: string): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("client-manager", {
        directory,
        clients: this.registry.list().length,
        integrations: this.listConnectedIntegrations(),
      });
    }
    if (this.verificationManager) {
      try {
        await this.verificationManager.verify({ dryRun: true });
      } catch (err) {
        if (this.logger) {
          await this.logger
            .withCorrelationId(directory)
            .warn(
              `client-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
            );
        }
      }
    }
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("client-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "client-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: ClientEventPhase, client: Client): Promise<void> {
    await this.notifyById(phase, client.id);
  }

  private async notifyById(phase: ClientEventPhase, clientId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`client.${phase}`, { clientId }, { correlationId: clientId });
    }
    if (this.logger) {
      await this.logger.withCorrelationId(clientId).info(`client:${phase} ${clientId}`);
    }
  }
}
