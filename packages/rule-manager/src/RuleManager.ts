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
import type { VerificationManager } from "@dwm/verification";
import type { StatusProvider } from "@dwm/status";
import { makeStatusReport } from "@dwm/status";
import { RuleRepository } from "./RuleRepository.js";
import { RuleRegistry } from "./RuleRegistry.js";
import { RuleValidator, type RuleValidationResult } from "./RuleValidator.js";
import { extractRuleTitle } from "./RuleFrontmatter.js";
import {
  type Rule,
  type RuleCreateRequest,
  type RuleFilter,
  type RuleListOptions,
  type RuleMetadata,
  type RuleSummary,
} from "./RuleTypes.js";
import { RuleErrorCode } from "./errors/RuleErrorCode.js";
import { createRuleError } from "./errors/RuleError.js";

export interface RuleManagerOptions {
  readonly psnAdapter: PSNAdapter;
  readonly repository?: RuleRepository;
  readonly registry?: RuleRegistry;
  readonly validator?: RuleValidator;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly agentManager?: AgentManager;
  readonly skillManager?: SkillManager;
  readonly verificationManager?: VerificationManager;
}

type RuleEventPhase = "created" | "updated" | "deleted" | "duplicated" | "archived" | "restored";

/**
 * Módulo 25 — Rule Manager. Trabaja directamente sobre las reglas
 * reales del Workspace (ficheros Markdown dentro del recurso `rules`
 * que ya reconoce `@dwm/psn-adapter`), sin crear una base de datos y
 * sin duplicar información. Archivar y restaurar reescriben únicamente
 * el bloque `dwm:` reservado del frontmatter, de forma no destructiva y
 * sin mover ni renombrar ningún fichero. Implementa `IModule`,
 * integrándose con el resto del Engine únicamente a través de las APIs
 * públicas de `PSNAdapter`, `WorkspaceManager`, `WorkspacePaths`,
 * `ImportManager`, `AgentManager`, `SkillManager`, `VerificationManager`
 * y `@dwm/status`.
 */
export class RuleManager implements IModule {
  readonly id = "rule-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly psnAdapter: PSNAdapter;
  private readonly repository: RuleRepository;
  private readonly registry: RuleRegistry;
  private readonly validator: RuleValidator;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly agentManager?: AgentManager;
  private readonly skillManager?: SkillManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: RuleManagerOptions) {
    if (!options || !options.psnAdapter) {
      throw createRuleError({
        code: RuleErrorCode.RULE_INVALID_REQUEST,
        message:
          "RuleManagerOptions.psnAdapter es obligatorio: es la única vía admitida para localizar las reglas reales del Workspace.",
        origin: "request",
        recoverable: false,
      });
    }
    this.psnAdapter = options.psnAdapter;
    this.repository = options.repository ?? new RuleRepository();
    this.registry = options.registry ?? new RuleRegistry();
    this.validator = options.validator ?? new RuleValidator();

    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.configManager) this.configManager = options.configManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.workspacePaths) this.workspacePaths = options.workspacePaths;
    if (options.importManager) this.importManager = options.importManager;
    if (options.agentManager) this.agentManager = options.agentManager;
    if (options.skillManager) this.skillManager = options.skillManager;
    if (options.verificationManager) this.verificationManager = options.verificationManager;
  }

  // ---------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------

  async listRules(options: RuleListOptions = {}): Promise<RuleSummary[]> {
    await this.refreshIndex(options.root);
    const summaries = this.registry.list();
    return options.includeArchived ? summaries : summaries.filter((summary) => !summary.archived);
  }

  async getRule(id: string, root?: string): Promise<Rule> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    return this.readExisting(directory, id);
  }

  /**
   * client-workflow "fix/library-edit-and-simple-ai" — resuelve la
   * ruta absoluta real del fichero físico de una regla ya existente
   * (`.kilo/rules/<id>.md`), para que el renderer nunca tenga que
   * construir la ruta por su cuenta.
   */
  async getRuleFilePath(id: string, root?: string): Promise<string> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    await this.readExisting(directory, id);
    return this.repository.getFilePath(directory, id);
  }

  async getRuleMetadata(id: string, root?: string): Promise<RuleMetadata> {
    return (await this.getRule(id, root)).metadata;
  }

  async searchRules(query: string, root?: string): Promise<RuleSummary[]> {
    await this.refreshIndex(root);
    return this.registry.search(query);
  }

  async filterRules(filter: RuleFilter, root?: string): Promise<RuleSummary[]> {
    await this.refreshIndex(root);
    return this.registry.filter(filter);
  }

  // ---------------------------------------------------------------------
  // Validación de estructura
  // ---------------------------------------------------------------------

  /** Valida la estructura de una regla ya materializada (id + contenido + metadatos), sin tocar el disco. */
  validateRuleStructure(rule: Rule): RuleValidationResult {
    return this.validator.validateStructure(rule);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  async createRule(request: RuleCreateRequest, root?: string): Promise<Rule> {
    this.validator.assertValidId(request.id);
    this.validator.assertValidContent(request.content);
    const directory = this.resolveDirectory(root);

    if (await this.repository.exists(directory, request.id)) {
      throw createRuleError({
        code: RuleErrorCode.RULE_ALREADY_EXISTS,
        message: `Ya existe una regla con id "${request.id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const metadata: RuleMetadata = { archived: false, createdAt: now, updatedAt: now };
    const rule = await this.persist(directory, request.id, request.content, metadata);
    await this.notify("created", rule);
    await this.afterMutation(directory);
    return rule;
  }

  /** Edita (sustituye por completo) el contenido de una regla existente y guarda el resultado en disco. */
  async updateRule(id: string, content: string, root?: string): Promise<Rule> {
    this.validator.assertExistingId(id);
    this.validator.assertValidContent(content);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);

    const metadata: RuleMetadata = { ...existing.metadata, updatedAt: new Date().toISOString() };
    const rule = await this.persist(directory, id, content, metadata);
    await this.notify("updated", rule);
    await this.afterMutation(directory);
    return rule;
  }

  /** Guarda una regla ya materializada tal cual (usado cuando quien llama ya tiene el `Rule` completo, p. ej. tras editarla en memoria). */
  async saveRule(rule: Rule, root?: string): Promise<Rule> {
    this.validator.assertValidStructure(rule);
    const directory = this.resolveDirectory(root);
    const metadata: RuleMetadata = { ...rule.metadata, updatedAt: new Date().toISOString() };
    const saved = await this.persist(directory, rule.id, rule.content, metadata);
    await this.notify("updated", saved);
    await this.afterMutation(directory);
    return saved;
  }

  async duplicateRule(id: string, newId: string, root?: string): Promise<Rule> {
    this.validator.assertValidId(newId);
    const directory = this.resolveDirectory(root);
    const source = await this.readExisting(directory, id);

    if (await this.repository.exists(directory, newId)) {
      throw createRuleError({
        code: RuleErrorCode.RULE_ALREADY_EXISTS,
        message: `Ya existe una regla con id "${newId}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const metadata: RuleMetadata = { archived: false, createdAt: now, updatedAt: now };
    const duplicate = await this.persist(directory, newId, source.content, metadata);
    await this.notify("duplicated", duplicate);
    await this.afterMutation(directory);
    return duplicate;
  }

  async deleteRule(id: string, root?: string): Promise<void> {
    this.validator.assertExistingId(id);
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    await this.repository.delete(directory, id);
    this.registry.delete(id);
    await this.notify("deleted", existing);
    await this.afterMutation(directory);
  }

  async archiveRule(id: string, root?: string): Promise<Rule> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (existing.metadata.archived) {
      throw createRuleError({
        code: RuleErrorCode.RULE_ALREADY_ARCHIVED,
        message: `La regla "${id}" ya está archivada.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const now = new Date().toISOString();
    const metadata: RuleMetadata = {
      ...existing.metadata,
      archived: true,
      archivedAt: now,
      updatedAt: now,
    };
    const rule = await this.persist(directory, id, existing.content, metadata);
    await this.notify("archived", rule);
    await this.afterMutation(directory);
    return rule;
  }

  async restoreRule(id: string, root?: string): Promise<Rule> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (!existing.metadata.archived) {
      throw createRuleError({
        code: RuleErrorCode.RULE_NOT_ARCHIVED,
        message: `La regla "${id}" no está archivada.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const metadata: RuleMetadata = {
      archived: false,
      createdAt: existing.metadata.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const rule = await this.persist(directory, id, existing.content, metadata);
    await this.notify("restored", rule);
    await this.afterMutation(directory);
    return rule;
  }

  // ---------------------------------------------------------------------
  // Resolución del directorio de reglas (vía PSN Adapter)
  // ---------------------------------------------------------------------

  private resolveDirectory(root?: string): string {
    const directory = this.psnAdapter.getResourcePath("rules", root);
    if (!directory) {
      throw createRuleError({
        code: RuleErrorCode.RULE_DIRECTORY_UNRESOLVABLE,
        message:
          'No se pudo resolver el directorio de reglas: PSNAdapter no reconoce el recurso "rules" en el Workspace escaneado. Escanea el Workspace con PSNAdapter.scanWorkspace() primero.',
        origin: "directory",
        recoverable: true,
      });
    }
    return directory;
  }

  /** Lee una regla que ya se sabe debería existir en `directory` (un directorio ya resuelto, nunca una raíz sin resolver). */
  private async readExisting(directory: string, id: string): Promise<Rule> {
    const rule = await this.repository.read(directory, id);
    if (!rule) {
      throw createRuleError({
        code: RuleErrorCode.RULE_NOT_FOUND,
        message: `No existe ninguna regla con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return rule;
  }

  private async refreshIndex(root?: string): Promise<void> {
    const directory = this.resolveDirectory(root);
    const ids = await this.repository.listIds(directory);
    const summaries: RuleSummary[] = [];
    for (const id of ids) {
      const rule = await this.repository.read(directory, id);
      if (!rule) continue;
      summaries.push(this.toSummary(rule));
    }
    this.registry.replaceAll(summaries);
  }

  private async persist(
    directory: string,
    id: string,
    content: string,
    metadata: RuleMetadata
  ): Promise<Rule> {
    await this.repository.write(directory, id, content, metadata);
    const rule: Rule = { id, content, metadata };
    this.registry.set(this.toSummary(rule));
    return rule;
  }

  private toSummary(rule: Rule): RuleSummary {
    const title = extractRuleTitle(rule.content);
    return {
      id: rule.id,
      archived: rule.metadata.archived,
      createdAt: rule.metadata.createdAt,
      updatedAt: rule.metadata.updatedAt,
      ...(title ? { title } : {}),
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
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "rule-manager",
      getStatus: () => {
        let directory: string | undefined;
        try {
          directory = this.resolveDirectory();
        } catch {
          return makeStatusReport(
            "rule-manager",
            "UNKNOWN",
            "Todavía no se puede resolver el directorio de reglas: escanea el Workspace con PSNAdapter primero."
          );
        }
        return makeStatusReport("rule-manager", "OK", "rule-manager responde correctamente.", {
          directory,
          rules: this.registry.list().length,
        });
      },
    };
  }

  private async afterMutation(directory: string): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("rule-manager", {
        directory,
        rules: this.registry.list().length,
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
              `rule-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
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
      await this.configManager.setSection("rule-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "rule-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: RuleEventPhase, rule: Rule): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`rule.${phase}`, { ruleId: rule.id }, { correlationId: rule.id });
    }
    if (this.logger) {
      await this.logger.withCorrelationId(rule.id).info(`rule:${phase} ${rule.id}`);
    }
  }
}
