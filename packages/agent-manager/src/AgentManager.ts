import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { WorkspacePaths } from "@dwm/portable-workspace";
import type { ImportManager } from "@dwm/import-manager";
import type { PSNAdapter } from "@dwm/psn-adapter";
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { AgentRepository } from "./AgentRepository.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { AgentValidator, type AgentValidationResult } from "./AgentValidator.js";
import { extractAgentDisplayFields } from "./AgentFrontmatter.js";
import {
  type Agent,
  type AgentCreateRequest,
  type AgentFilter,
  type AgentListOptions,
  type AgentMetadata,
  type AgentSummary,
} from "./AgentTypes.js";
import { AgentErrorCode } from "./errors/AgentErrorCode.js";
import { createAgentError } from "./errors/AgentError.js";

export interface AgentManagerOptions {
  readonly psnAdapter: PSNAdapter;
  readonly repository?: AgentRepository;
  readonly registry?: AgentRegistry;
  readonly validator?: AgentValidator;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly verificationManager?: VerificationManager;
}

type AgentEventPhase = "created" | "updated" | "deleted" | "duplicated" | "archived" | "restored";

/**
 * Módulo 23 — Agent Manager. Trabaja directamente sobre los agentes
 * reales del Workspace: ficheros Markdown individuales dentro del
 * recurso `agents` que ya reconoce `@dwm/psn-adapter`
 * (`.kilo/agents/<id>.md`), con el mismo frontmatter YAML
 * (`description`/`mode`/`color`) que ya usan el PSN-BASE real y Kilo
 * Code — sin crear una base de datos, sin duplicar información y sin
 * mover ningún fichero: archivar y restaurar reescriben únicamente el
 * bloque `dwm:` reservado del frontmatter, de forma no destructiva.
 * Implementa `IModule`, integrándose con el resto del Engine únicamente
 * a través de las APIs públicas de `PSNAdapter`, `WorkspaceManager`,
 * `WorkspacePaths`, `ImportManager`, `VerificationManager` y
 * `@dwm/status`.
 */
export class AgentManager implements IModule {
  readonly id = "agent-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly psnAdapter: PSNAdapter;
  private readonly repository: AgentRepository;
  private readonly registry: AgentRegistry;
  private readonly validator: AgentValidator;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: AgentManagerOptions) {
    if (!options || !options.psnAdapter) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_INVALID_REQUEST,
        message:
          "AgentManagerOptions.psnAdapter es obligatorio: es la única vía admitida para localizar los agentes reales del Workspace.",
        origin: "request",
        recoverable: false,
      });
    }
    this.psnAdapter = options.psnAdapter;
    this.repository = options.repository ?? new AgentRepository();
    this.registry = options.registry ?? new AgentRegistry();
    this.validator = options.validator ?? new AgentValidator();

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.importManager) this.importManager = options.importManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

  async listAgents(options: AgentListOptions = {}): Promise<AgentSummary[]> {
    await this.refreshIndex(options.root);
    const summaries = this.registry.list();
    return options.includeArchived ? summaries : summaries.filter((summary) => !summary.archived);
  }

  async getAgent(id: string, root?: string): Promise<Agent> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    return this.readExisting(directory, id);
  }

  /**
   * client-workflow "fix/library-edit-and-simple-ai" — resuelve la
   * ruta absoluta real del fichero físico de un agente ya existente
   * (`.kilo/agents/<id>.md`), para que el renderer nunca tenga que
   * construir la ruta por su cuenta (nunca envía una ruta libre: solo
   * `id`/`root`, y el backend resuelve). Comprueba primero que el
   * agente existe de verdad (mismo `readExisting` de siempre) antes de
   * devolver la ruta.
   */
  async getAgentFilePath(id: string, root?: string): Promise<string> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    await this.readExisting(directory, id);
    return this.repository.getFilePath(directory, id);
  }

  /** Lee un agente que ya se sabe debería existir en `directory` (un directorio ya resuelto, nunca una raíz sin resolver). */
  private async readExisting(directory: string, id: string): Promise<Agent> {
    const agent = await this.repository.read(directory, id);
    if (!agent) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_NOT_FOUND,
        message: `No existe ningún agente con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return agent;
  }

  async getAgentMetadata(id: string, root?: string): Promise<AgentMetadata> {
    return (await this.getAgent(id, root)).metadata;
  }

  async searchAgents(query: string, root?: string): Promise<AgentSummary[]> {
    await this.refreshIndex(root);
    return this.registry.search(query);
  }

  async filterAgents(filter: AgentFilter, root?: string): Promise<AgentSummary[]> {
    await this.refreshIndex(root);
    return this.registry.filter(filter);
  }

  // ---------------------------------------------------------------------
  // Validación de estructura
  // ---------------------------------------------------------------------

  /** Valida la estructura de un agente ya materializado (id + contenido + metadatos), sin tocar el disco. */
  validateAgentStructure(agent: Agent): AgentValidationResult {
    return this.validator.validateStructure(agent);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  async createAgent(request: AgentCreateRequest, root?: string): Promise<Agent> {
    this.validator.assertValidId(request.id);
    this.validator.assertValidContent(request.content);
    const directory = this.resolveDirectory(root);

    if (await this.repository.exists(directory, request.id)) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
        message: `Ya existe un agente con id "${request.id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const metadata: AgentMetadata = { archived: false, createdAt: now, updatedAt: now };
    const agent = await this.persist(directory, request.id, request.content, metadata);
    await this.notify("created", agent);
    await this.afterMutation(directory);
    return agent;
  }

  /** Edita (sustituye por completo) el contenido de un agente existente y guarda el resultado en disco. */
  async updateAgent(id: string, content: string, root?: string): Promise<Agent> {
    this.validator.assertExistingId(id);
    this.validator.assertValidContent(content);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);

    const metadata: AgentMetadata = { ...existing.metadata, updatedAt: new Date().toISOString() };
    const agent = await this.persist(directory, id, content, metadata);
    await this.notify("updated", agent);
    await this.afterMutation(directory);
    return agent;
  }

  /** Guarda un agente ya materializado tal cual (usado cuando quien llama ya tiene el `Agent` completo, p. ej. tras editarlo en memoria). */
  async saveAgent(agent: Agent, root?: string): Promise<Agent> {
    this.validator.assertValidStructure(agent);
    const directory = this.resolveDirectory(root);
    const metadata: AgentMetadata = { ...agent.metadata, updatedAt: new Date().toISOString() };
    const saved = await this.persist(directory, agent.id, agent.content, metadata);
    await this.notify("updated", saved);
    await this.afterMutation(directory);
    return saved;
  }

  async duplicateAgent(id: string, newId: string, root?: string): Promise<Agent> {
    this.validator.assertValidId(newId);
    const directory = this.resolveDirectory(root);
    const source = await this.readExisting(directory, id);

    if (await this.repository.exists(directory, newId)) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_ALREADY_EXISTS,
        message: `Ya existe un agente con id "${newId}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const metadata: AgentMetadata = { archived: false, createdAt: now, updatedAt: now };
    const duplicate = await this.persist(directory, newId, source.content, metadata);
    await this.notify("duplicated", duplicate);
    await this.afterMutation(directory);
    return duplicate;
  }

  async deleteAgent(id: string, root?: string): Promise<void> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    await this.repository.delete(directory, id);
    this.registry.delete(id);
    await this.notify("deleted", existing);
    await this.afterMutation(directory);
  }

  async archiveAgent(id: string, root?: string): Promise<Agent> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (existing.metadata.archived) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_ALREADY_ARCHIVED,
        message: `El agente "${id}" ya está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const now = new Date().toISOString();
    const metadata: AgentMetadata = {
      ...existing.metadata,
      archived: true,
      archivedAt: now,
      updatedAt: now,
    };
    const agent = await this.persist(directory, id, existing.content, metadata);
    await this.notify("archived", agent);
    await this.afterMutation(directory);
    return agent;
  }

  async restoreAgent(id: string, root?: string): Promise<Agent> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (!existing.metadata.archived) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_NOT_ARCHIVED,
        message: `El agente "${id}" no está archivado.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const metadata: AgentMetadata = {
      archived: false,
      createdAt: existing.metadata.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const agent = await this.persist(directory, id, existing.content, metadata);
    await this.notify("restored", agent);
    await this.afterMutation(directory);
    return agent;
  }

  // ---------------------------------------------------------------------
  // Resolución del directorio de agentes (vía PSN Adapter)
  // ---------------------------------------------------------------------

  private resolveDirectory(root?: string): string {
    const directory = this.psnAdapter.getResourcePath("agents", root);
    if (!directory) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_DIRECTORY_UNRESOLVABLE,
        message:
          'No se pudo resolver el directorio de agentes: PSNAdapter no reconoce el recurso "agents" en el Workspace escaneado. Escanea el Workspace con PSNAdapter.scanWorkspace() primero.',
        origin: "directory",
        recoverable: true,
      });
    }
    return directory;
  }

  private async refreshIndex(root?: string): Promise<void> {
    const directory = this.resolveDirectory(root);
    const ids = await this.repository.listIds(directory);
    const summaries: AgentSummary[] = [];
    for (const id of ids) {
      const agent = await this.repository.read(directory, id);
      if (!agent) continue;
      summaries.push(this.toSummary(agent));
    }
    this.registry.replaceAll(summaries);
  }

  private async persist(
    directory: string,
    id: string,
    content: string,
    metadata: AgentMetadata
  ): Promise<Agent> {
    await this.repository.write(directory, id, content, metadata);
    const agent: Agent = { id, content, metadata };
    this.registry.set(this.toSummary(agent));
    return agent;
  }

  private toSummary(agent: Agent): AgentSummary {
    const { name, description, mode, color } = extractAgentDisplayFields(agent.content);
    return {
      id: agent.id,
      archived: agent.metadata.archived,
      createdAt: agent.metadata.createdAt,
      updatedAt: agent.metadata.updatedAt,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(mode ? { mode } : {}),
      ...(color ? { color } : {}),
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
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "agent-manager",
      getStatus: () => {
        let directory: string | undefined;
        try {
          directory = this.resolveDirectory();
        } catch {
          return makeStatusReport(
            "agent-manager",
            "UNKNOWN",
            "Todavía no se puede resolver el directorio de agentes: escanea el Workspace con PSNAdapter primero."
          );
        }
        return makeStatusReport("agent-manager", "OK", "agent-manager responde correctamente.", {
          directory,
          agents: this.registry.list().length,
        });
      },
    };
  }

  private async afterMutation(directory: string): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("agent-manager", {
        directory,
        agents: this.registry.list().length,
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
              `agent-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
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
      await this.configManager.setSection("agent-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "agent-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: AgentEventPhase, agent: Agent): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(
        `agent.${phase}`,
        { agentId: agent.id },
        { correlationId: agent.id }
      );
    }
    if (this.logger) {
      await this.logger.withCorrelationId(agent.id).info(`agent:${phase} ${agent.id}`);
    }
  }
}
