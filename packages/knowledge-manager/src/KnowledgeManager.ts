import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { ImportManager } from "@dwm/import-manager";
import type { PSNAdapter } from "@dwm/psn-adapter";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { KnowledgeRepository } from "./KnowledgeRepository.js";
import { KnowledgeRegistry } from "./KnowledgeRegistry.js";
import { KnowledgeValidator, type KnowledgeValidationResult } from "./KnowledgeValidator.js";
import { KnowledgeMetadataService } from "./KnowledgeMetadata.js";
import { KnowledgeRelations, type KnowledgeRelationView } from "./KnowledgeRelations.js";
import { extractKnowledgeTitle } from "./KnowledgeFrontmatter.js";
import {
  type KnowledgeCreateRequest,
  type KnowledgeDeleteOptions,
  type KnowledgeDuplicateGroup,
  type KnowledgeFilter,
  type KnowledgeItem,
  type KnowledgeListOptions,
  type KnowledgeMetadata,
  type KnowledgeMetadataUpdate,
  type KnowledgeNode,
  type KnowledgeSummary,
} from "./KnowledgeTypes.js";
import { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
import { createKnowledgeError } from "./errors/KnowledgeError.js";

export interface KnowledgeManagerOptions {
  readonly psnAdapter: PSNAdapter;
  readonly repository?: KnowledgeRepository;
  readonly registry?: KnowledgeRegistry;
  readonly validator?: KnowledgeValidator;
  readonly metadataService?: KnowledgeMetadataService;
  readonly relations?: KnowledgeRelations;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly ruleManager?: RuleManager;
  readonly verificationManager?: VerificationManager;
}

type KnowledgeEventPhase =
  | "created"
  | "updated"
  | "deleted"
  | "duplicated"
  | "archived"
  | "restored"
  | "relation.added"
  | "relation.removed";

/**
 * Módulo 26 — Knowledge Manager. Gestiona el conocimiento del Workspace
 * de forma estructural, trabajando directamente sobre los ficheros
 * reales del recurso `psn-knowledge-global` que ya reconoce
 * `@dwm/psn-adapter`, sin crear una base de datos y sin duplicar
 * información. No implementa IA, búsqueda semántica, embeddings ni
 * indexación vectorial: la búsqueda es textual simple sobre id, título
 * y etiquetas, y las relaciones entre elementos son simples y
 * dirigidas (eso queda para módulos posteriores). Archivar y restaurar
 * reescriben únicamente el bloque `dwm:` reservado del frontmatter, de
 * forma no destructiva y sin mover ni renombrar ningún fichero.
 * Implementa `IModule`, integrándose con el resto del Engine únicamente
 * a través de las APIs públicas de `PSNAdapter`, `WorkspaceManager`,
 * `WorkspacePaths`, `ImportManager`, `AgentManager`, `SkillManager`,
 * `RuleManager`, `VerificationManager` y `@dwm/status`.
 */
export class KnowledgeManager implements IModule {
  readonly id = "knowledge-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly psnAdapter: PSNAdapter;
  private readonly repository: KnowledgeRepository;
  private readonly registry: KnowledgeRegistry;
  private readonly validator: KnowledgeValidator;
  private readonly metadataService: KnowledgeMetadataService;
  private readonly relations: KnowledgeRelations;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly agentManager?: AgentManager;
  private readonly skillManager?: SkillManager;
  private readonly ruleManager?: RuleManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: KnowledgeManagerOptions) {
    if (!options || !options.psnAdapter) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_REQUEST,
        message:
          "KnowledgeManagerOptions.psnAdapter es obligatorio: es la única vía admitida para localizar el conocimiento real del Workspace.",
        origin: "request",
        recoverable: false,
      });
    }
    this.psnAdapter = options.psnAdapter;
    this.repository = options.repository ?? new KnowledgeRepository();
    this.registry = options.registry ?? new KnowledgeRegistry();
    this.validator = options.validator ?? new KnowledgeValidator();
    this.metadataService = options.metadataService ?? new KnowledgeMetadataService();
    this.relations = options.relations ?? new KnowledgeRelations();

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.importManager) this.importManager = options.importManager;
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.ruleManager) this.ruleManager = options.ruleManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

  async listKnowledge(options: KnowledgeListOptions = {}): Promise<KnowledgeSummary[]> {
    await this.refreshIndex(options.root);
    const summaries = this.registry.list();
    return options.includeArchived ? summaries : summaries.filter((summary) => !summary.archived);
  }

  async getKnowledge(id: string, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(id);
    const directory = this.resolveDirectory(root);
    return this.readExisting(directory, id);
  }

  /** Lee únicamente el contenido textual de un elemento (sin el bloque de metadatos gestionado por DWM). */
  async getKnowledgeContent(id: string, root?: string): Promise<string> {
    return (await this.getKnowledge(id, root)).content;
  }

  async getKnowledgeMetadata(id: string, root?: string): Promise<KnowledgeMetadata> {
    return (await this.getKnowledge(id, root)).metadata;
  }

  async searchKnowledge(query: string, root?: string): Promise<KnowledgeSummary[]> {
    await this.refreshIndex(root);
    return this.registry.search(query);
  }

  async filterKnowledge(filter: KnowledgeFilter, root?: string): Promise<KnowledgeSummary[]> {
    await this.refreshIndex(root);
    return this.registry.filter(filter);
  }

  async listTags(root?: string): Promise<string[]> {
    await this.refreshIndex(root);
    return this.registry.listTags();
  }

  async listCategories(root?: string): Promise<string[]> {
    await this.refreshIndex(root);
    return this.registry.listCategories();
  }

  /** Árbol de navegación jerárquica completo del recurso de conocimiento (carpetas y ficheros, reconocidos o no). */
  async listTree(root?: string): Promise<KnowledgeNode[]> {
    const directory = this.resolveDirectory(root);
    return this.repository.buildTree(directory);
  }

  /** Grupos de elementos que comparten el mismo nombre de fichero (último segmento del id), sin distinguir mayúsculas. */
  async findDuplicatesByName(root?: string): Promise<KnowledgeDuplicateGroup[]> {
    await this.refreshIndex(root);
    return this.registry.findDuplicatesByName();
  }

  /** Grupos de elementos cuya ruta colisiona salvo mayúsculas/minúsculas. */
  async findDuplicatesByPath(root?: string): Promise<KnowledgeDuplicateGroup[]> {
    await this.refreshIndex(root);
    return this.registry.findDuplicatesByPath();
  }

  // ---------------------------------------------------------------------
  // Relaciones
  // ---------------------------------------------------------------------

  async listRelations(id: string, root?: string): Promise<KnowledgeRelationView> {
    await this.refreshIndex(root);
    return this.relations.view(this.registry, id);
  }

  async addRelation(id: string, relatedId: string, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(id);
    this.validator.assertValidId(relatedId);
    await this.refreshIndex(root);
    this.relations.assertCanRelate(this.registry, id, relatedId);

    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    const metadata = this.metadataService.withRelationAdded(existing.metadata, relatedId);
    const item = await this.persist(directory, id, existing.content, metadata);
    await this.notify("relation.added", item);
    await this.afterMutation(directory);
    return item;
  }

  async removeRelation(id: string, relatedId: string, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(id);
    this.validator.assertValidId(relatedId);
    await this.refreshIndex(root);
    this.relations.assertHasRelation(this.registry, id, relatedId);

    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    const metadata = this.metadataService.withRelationRemoved(existing.metadata, relatedId);
    const item = await this.persist(directory, id, existing.content, metadata);
    await this.notify("relation.removed", item);
    await this.afterMutation(directory);
    return item;
  }

  // ---------------------------------------------------------------------
  // Validación de estructura
  // ---------------------------------------------------------------------

  /** Valida la estructura de un elemento ya materializado (id + contenido + metadatos), sin tocar el disco. */
  validateKnowledgeStructure(item: KnowledgeItem): KnowledgeValidationResult {
    return this.validator.validateStructure(item);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  async createKnowledge(request: KnowledgeCreateRequest, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(request.id);
    this.validator.assertValidContent(request.content);
    if (request.tags) this.validator.assertValidTags(request.tags);
    if (request.category !== undefined) this.validator.assertValidCategory(request.category);

    const directory = this.resolveDirectory(root);
    if (await this.repository.exists(directory, request.id)) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_EXISTS,
        message: `Ya existe un elemento de conocimiento con id "${request.id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const metadata = this.metadataService.createInitial({
      ...(request.tags ? { tags: request.tags } : {}),
      ...(request.category ? { category: request.category } : {}),
    });
    const item = await this.persist(directory, request.id, request.content, metadata);
    await this.notify("created", item);
    await this.afterMutation(directory);
    return item;
  }

  /** Edita (sustituye por completo) el contenido de un elemento existente y guarda el resultado en disco. */
  async updateKnowledge(id: string, content: string, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(id);
    this.validator.assertValidContent(content);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);

    const metadata = this.metadataService.withTouchedTimestamp(existing.metadata);
    const item = await this.persist(directory, id, content, metadata);
    await this.notify("updated", item);
    await this.afterMutation(directory);
    return item;
  }

  /** Aplica cambios de etiquetas y/o categoría sin tocar el contenido del elemento. */
  async updateKnowledgeMetadata(
    id: string,
    update: KnowledgeMetadataUpdate,
    root?: string
  ): Promise<KnowledgeItem> {
    this.validator.assertValidId(id);
    if (update.tags) this.validator.assertValidTags(update.tags);
    if (update.category !== undefined && update.category !== null) {
      this.validator.assertValidCategory(update.category);
    }

    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    const metadata = this.metadataService.withMetadataUpdate(existing.metadata, update);
    const item = await this.persist(directory, id, existing.content, metadata);
    await this.notify("updated", item);
    await this.afterMutation(directory);
    return item;
  }

  /** Guarda un elemento ya materializado tal cual (usado cuando quien llama ya tiene el `KnowledgeItem` completo, p. ej. tras editarlo en memoria). */
  async saveKnowledge(item: KnowledgeItem, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidStructure(item);
    const directory = this.resolveDirectory(root);
    const metadata = this.metadataService.withTouchedTimestamp(item.metadata);
    const saved = await this.persist(directory, item.id, item.content, metadata);
    await this.notify("updated", saved);
    await this.afterMutation(directory);
    return saved;
  }

  async duplicateKnowledge(id: string, newId: string, root?: string): Promise<KnowledgeItem> {
    this.validator.assertValidId(newId);
    const directory = this.resolveDirectory(root);
    const source = await this.readExisting(directory, id);

    if (await this.repository.exists(directory, newId)) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_EXISTS,
        message: `Ya existe un elemento de conocimiento con id "${newId}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const metadata = this.metadataService.createInitial({
      tags: source.metadata.tags,
      ...(source.metadata.category ? { category: source.metadata.category } : {}),
    });
    const duplicate = await this.persist(directory, newId, source.content, metadata);
    await this.notify("duplicated", duplicate);
    await this.afterMutation(directory);
    return duplicate;
  }

  /** Elimina un elemento de conocimiento de forma permanente e irreversible. `options.confirmPermanent` debe ser exactamente `true`. */
  async deleteKnowledge(id: string, options: KnowledgeDeleteOptions, root?: string): Promise<void> {
    this.validator.assertValidId(id);
    if (options?.confirmPermanent !== true) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_DELETE_NOT_CONFIRMED,
        message: `La eliminación del elemento de conocimiento "${id}" requiere confirmarse explícitamente con { confirmPermanent: true }.`,
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

  async archiveKnowledge(id: string, root?: string): Promise<KnowledgeItem> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (existing.metadata.archived) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_ALREADY_ARCHIVED,
        message: `El elemento de conocimiento "${id}" ya está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const metadata = this.metadataService.withArchived(existing.metadata);
    const item = await this.persist(directory, id, existing.content, metadata);
    await this.notify("archived", item);
    await this.afterMutation(directory);
    return item;
  }

  async restoreKnowledge(id: string, root?: string): Promise<KnowledgeItem> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (!existing.metadata.archived) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_ARCHIVED,
        message: `El elemento de conocimiento "${id}" no está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const metadata = this.metadataService.withRestored(existing.metadata);
    const item = await this.persist(directory, id, existing.content, metadata);
    await this.notify("restored", item);
    await this.afterMutation(directory);
    return item;
  }

  // ---------------------------------------------------------------------
  // Resolución del directorio de conocimiento (vía PSN Adapter)
  // ---------------------------------------------------------------------

  private resolveDirectory(root?: string): string {
    const directory = this.psnAdapter.getResourcePath("psn-knowledge-global", root);
    if (!directory) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_DIRECTORY_UNRESOLVABLE,
        message:
          'No se pudo resolver el directorio de conocimiento: PSNAdapter no reconoce el recurso "psn-knowledge-global" en el Workspace escaneado. Escanea el Workspace con PSNAdapter.scanWorkspace() primero.',
        origin: "directory",
        recoverable: true,
      });
    }
    return directory;
  }

  /** Lee un elemento que ya se sabe debería existir en `directory` (un directorio ya resuelto, nunca una raíz sin resolver). */
  private async readExisting(directory: string, id: string): Promise<KnowledgeItem> {
    const item = await this.repository.read(directory, id);
    if (!item) {
      throw createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
        message: `No existe ningún elemento de conocimiento con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return item;
  }

  private async refreshIndex(root?: string): Promise<void> {
    const directory = this.resolveDirectory(root);
    const ids = await this.repository.listIds(directory);
    const summaries: KnowledgeSummary[] = [];
    for (const id of ids) {
      const item = await this.repository.read(directory, id);
      if (!item) continue;
      summaries.push(this.toSummary(item));
    }
    this.registry.replaceAll(summaries);
  }

  private async persist(
    directory: string,
    id: string,
    content: string,
    metadata: KnowledgeMetadata
  ): Promise<KnowledgeItem> {
    await this.repository.write(directory, id, content, metadata);
    const item: KnowledgeItem = { id, content, metadata };
    this.registry.set(this.toSummary(item));
    return item;
  }

  private toSummary(item: KnowledgeItem): KnowledgeSummary {
    const title = extractKnowledgeTitle(item.content);
    return {
      id: item.id,
      archived: item.metadata.archived,
      createdAt: item.metadata.createdAt,
      updatedAt: item.metadata.updatedAt,
      tags: item.metadata.tags,
      relations: item.metadata.relations,
      ...(title ? { title } : {}),
      ...(item.metadata.category ? { category: item.metadata.category } : {}),
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
    if (this.agentManager) connected.push("agent-manager");
    if (this.skillManager) connected.push("skill-manager");
    if (this.ruleManager) connected.push("rule-manager");
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "knowledge-manager",
      getStatus: () => {
        let directory: string | undefined;
        try {
          directory = this.resolveDirectory();
        } catch {
          return makeStatusReport(
            "knowledge-manager",
            "UNKNOWN",
            "Todavía no se puede resolver el directorio de conocimiento: escanea el Workspace con PSNAdapter primero."
          );
        }
        return makeStatusReport(
          "knowledge-manager",
          "OK",
          "knowledge-manager responde correctamente.",
          { directory, items: this.registry.list().length }
        );
      },
    };
  }

  private async afterMutation(directory: string): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("knowledge-manager", {
        directory,
        items: this.registry.list().length,
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
              `knowledge-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
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
      await this.configManager.setSection("knowledge-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "knowledge-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: KnowledgeEventPhase, item: KnowledgeItem): Promise<void> {
    await this.notifyById(phase, item.id);
  }

  private async notifyById(phase: KnowledgeEventPhase, itemId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `knowledge.${phase}`,
        { knowledgeId: itemId },
        { correlationId: itemId }
      );
    }
    if (this.logger) {
      await this.logger.withCorrelationId(itemId).info(`knowledge:${phase} ${itemId}`);
    }
  }
}
