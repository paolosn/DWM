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
import { SkillRepository } from "./SkillRepository.js";
import { SkillRegistry } from "./SkillRegistry.js";
import { SkillValidator, type SkillValidationResult } from "./SkillValidator.js";
import { extractSkillTitle } from "./SkillFrontmatter.js";
import {
  type Skill,
  type SkillAuxFile,
  type SkillCreateRequest,
  type SkillDeleteOptions,
  type SkillFilter,
  type SkillFileStatus,
  type SkillListOptions,
  type SkillMetadata,
  type SkillSummary,
} from "./SkillTypes.js";
import { SkillErrorCode } from "./errors/SkillErrorCode.js";
import { SkillError, createSkillError } from "./errors/SkillError.js";

export interface SkillManagerOptions {
  readonly psnAdapter: PSNAdapter;
  readonly repository?: SkillRepository;
  readonly registry?: SkillRegistry;
  readonly validator?: SkillValidator;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly workspacePaths?: WorkspacePaths;
  readonly importManager?: ImportManager;
  readonly verificationManager?: VerificationManager;
}

type SkillEventPhase = "created" | "updated" | "deleted" | "duplicated" | "archived" | "restored";

/**
 * Módulo 24 — Skill Manager. Trabaja directamente sobre las skills
 * reales del Workspace (carpetas dentro del recurso `skills` que ya
 * reconoce `@dwm/psn-adapter`, cada una con su `SKILL.md` como fuente
 * principal), sin crear una base de datos, sin duplicar información y
 * sin mover ni reorganizar ninguna carpeta salvo lo explícitamente
 * solicitado (crear, duplicar o eliminar la carpeta exacta de una
 * skill). Archivar y restaurar reescriben únicamente el bloque `dwm:`
 * reservado del frontmatter de `SKILL.md`, de forma no destructiva.
 * Implementa `IModule`, integrándose con el resto del Engine únicamente
 * a través de las APIs públicas de `PSNAdapter`, `WorkspaceManager`,
 * `WorkspacePaths`, `ImportManager`, `VerificationManager` y
 * `@dwm/status`. No depende de `@dwm/agent-manager`: no se identificó
 * ninguna relación pública que no fuera un acoplamiento artificial entre
 * agentes y skills.
 */
export class SkillManager implements IModule {
  readonly id = "skill-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly psnAdapter: PSNAdapter;
  private readonly repository: SkillRepository;
  private readonly registry: SkillRegistry;
  private readonly validator: SkillValidator;

  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly configManager?: ConfigManager;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly workspacePaths?: WorkspacePaths;
  private readonly importManager?: ImportManager;
  private readonly verificationManager?: VerificationManager;

  constructor(options: SkillManagerOptions) {
    if (!options || !options.psnAdapter) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_INVALID_REQUEST,
        message:
          "SkillManagerOptions.psnAdapter es obligatorio: es la única vía admitida para localizar las skills reales del Workspace.",
        origin: "request",
        recoverable: false,
      });
    }
    this.psnAdapter = options.psnAdapter;
    this.repository = options.repository ?? new SkillRepository();
    this.registry = options.registry ?? new SkillRegistry();
    this.validator = options.validator ?? new SkillValidator();

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

  async listSkills(options: SkillListOptions = {}): Promise<SkillSummary[]> {
    await this.refreshIndex(options.root);
    const summaries = this.registry.list();
    return options.includeArchived ? summaries : summaries.filter((summary) => !summary.archived);
  }

  async getSkill(id: string, root?: string): Promise<Skill> {
    this.validator.assertValidId(id);
    const directory = this.resolveDirectory(root);
    return this.readExisting(directory, id);
  }

  /** Lee únicamente el texto de `SKILL.md` (sin el bloque de metadatos gestionado por DWM). */
  async getSkillFile(id: string, root?: string): Promise<string> {
    return (await this.getSkill(id, root)).content;
  }

  async getSkillMetadata(id: string, root?: string): Promise<SkillMetadata> {
    return (await this.getSkill(id, root)).metadata;
  }

  async listAuxFiles(id: string, root?: string): Promise<SkillAuxFile[]> {
    this.validator.assertValidId(id);
    const directory = this.resolveDirectory(root);
    await this.assertExists(directory, id);
    return this.repository.listAuxFiles(directory, id);
  }

  /** Lee el contenido de un archivo auxiliar concreto de una skill (nunca `SKILL.md`), con protección frente a path traversal. */
  async readAuxFile(id: string, relativePath: string, root?: string): Promise<string> {
    this.validator.assertValidId(id);
    this.validator.assertValidAuxRelativePath(relativePath);
    const directory = this.resolveDirectory(root);
    await this.assertExists(directory, id);
    return this.repository.readAuxFile(directory, id, relativePath);
  }

  /** Detecta, sin lanzar por ausencia o invalidez del propio `SKILL.md`, su estado (`"ok"`, `"missing"` o `"invalid"`). */
  async detectSkillFileIssue(id: string, root?: string): Promise<SkillFileStatus> {
    this.validator.assertValidId(id);
    const directory = this.resolveDirectory(root);
    await this.assertExists(directory, id);
    return this.repository.inspectSkillFile(directory, id);
  }

  async searchSkills(query: string, root?: string): Promise<SkillSummary[]> {
    await this.refreshIndex(root);
    return this.registry.search(query);
  }

  async filterSkills(filter: SkillFilter, root?: string): Promise<SkillSummary[]> {
    await this.refreshIndex(root);
    return this.registry.filter(filter);
  }

  // ---------------------------------------------------------------------
  // Validación de estructura
  // ---------------------------------------------------------------------

  /** Valida la estructura de una skill ya materializada (id + contenido + metadatos), sin tocar el disco. */
  validateSkillStructure(skill: Skill): SkillValidationResult {
    return this.validator.validateStructure(skill);
  }

  // ---------------------------------------------------------------------
  // Escritura
  // ---------------------------------------------------------------------

  async createSkill(request: SkillCreateRequest, root?: string): Promise<Skill> {
    this.validator.assertValidId(request.id);
    this.validator.assertValidContent(request.content);
    const directory = this.resolveDirectory(root);

    if (await this.repository.exists(directory, request.id)) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_ALREADY_EXISTS,
        message: `Ya existe una skill con id "${request.id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    const now = new Date().toISOString();
    const metadata: SkillMetadata = { archived: false, createdAt: now, updatedAt: now };
    const skill = await this.persist(directory, request.id, request.content, metadata);
    await this.notify("created", skill);
    await this.afterMutation(directory);
    return skill;
  }

  /**
   * Edita el contenido de una skill existente. Si su carpeta existe pero
   * `SKILL.md` estaba ausente o era inválido, esta es también la vía
   * para repararlo: no hay metadatos previos que preservar más allá de
   * la fecha de creación de la carpeta.
   */
  async updateSkill(id: string, content: string, root?: string): Promise<Skill> {
    this.validator.assertValidId(id);
    this.validator.assertValidContent(content);
    const directory = this.resolveDirectory(root);
    await this.assertExists(directory, id);

    const metadata = await this.metadataForUpdate(directory, id);
    const skill = await this.persist(directory, id, content, metadata);
    await this.notify("updated", skill);
    await this.afterMutation(directory);
    return skill;
  }

  /** Guarda una skill ya materializada tal cual (usado cuando quien llama ya tiene el `Skill` completo, p. ej. tras editarlo en memoria). */
  async saveSkill(skill: Skill, root?: string): Promise<Skill> {
    this.validator.assertValidStructure(skill);
    const directory = this.resolveDirectory(root);
    const metadata: SkillMetadata = { ...skill.metadata, updatedAt: new Date().toISOString() };
    const saved = await this.persist(directory, skill.id, skill.content, metadata);
    await this.notify("updated", saved);
    await this.afterMutation(directory);
    return saved;
  }

  async duplicateSkill(id: string, newId: string, root?: string): Promise<Skill> {
    this.validator.assertValidId(newId);
    const directory = this.resolveDirectory(root);
    const source = await this.readExisting(directory, id);

    if (await this.repository.exists(directory, newId)) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_ALREADY_EXISTS,
        message: `Ya existe una skill con id "${newId}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }

    await this.repository.copyTree(directory, id, newId);

    const now = new Date().toISOString();
    const metadata: SkillMetadata = { archived: false, createdAt: now, updatedAt: now };
    const duplicate = await this.persist(directory, newId, source.content, metadata);
    await this.notify("duplicated", duplicate);
    await this.afterMutation(directory);
    return duplicate;
  }

  /** Elimina una skill de forma permanente e irreversible. `options.confirmPermanent` debe ser exactamente `true`. */
  async deleteSkill(id: string, options: SkillDeleteOptions, root?: string): Promise<void> {
    this.validator.assertValidId(id);
    if (options?.confirmPermanent !== true) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_DELETE_NOT_CONFIRMED,
        message: `La eliminación de la skill "${id}" requiere confirmarse explícitamente con { confirmPermanent: true }.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const directory = this.resolveDirectory(root);
    await this.assertExists(directory, id);

    await this.repository.removeTree(directory, id);
    this.registry.delete(id);
    await this.notifyById("deleted", id);
    await this.afterMutation(directory);
  }

  async archiveSkill(id: string, root?: string): Promise<Skill> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (existing.metadata.archived) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_ALREADY_ARCHIVED,
        message: `La skill "${id}" ya está archivada.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const now = new Date().toISOString();
    const metadata: SkillMetadata = {
      ...existing.metadata,
      archived: true,
      archivedAt: now,
      updatedAt: now,
    };
    const skill = await this.persist(directory, id, existing.content, metadata);
    await this.notify("archived", skill);
    await this.afterMutation(directory);
    return skill;
  }

  async restoreSkill(id: string, root?: string): Promise<Skill> {
    const directory = this.resolveDirectory(root);
    const existing = await this.readExisting(directory, id);
    if (!existing.metadata.archived) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_NOT_ARCHIVED,
        message: `La skill "${id}" no está archivada.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    const metadata: SkillMetadata = {
      archived: false,
      createdAt: existing.metadata.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const skill = await this.persist(directory, id, existing.content, metadata);
    await this.notify("restored", skill);
    await this.afterMutation(directory);
    return skill;
  }

  // ---------------------------------------------------------------------
  // Resolución del directorio de skills (vía PSN Adapter)
  // ---------------------------------------------------------------------

  private resolveDirectory(root?: string): string {
    const directory = this.psnAdapter.getResourcePath("skills", root);
    if (!directory) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_DIRECTORY_UNRESOLVABLE,
        message:
          'No se pudo resolver el directorio de skills: PSNAdapter no reconoce el recurso "skills" en el Workspace escaneado. Escanea el Workspace con PSNAdapter.scanWorkspace() primero.',
        origin: "directory",
        recoverable: true,
      });
    }
    return directory;
  }

  private async assertExists(directory: string, id: string): Promise<void> {
    if (!(await this.repository.exists(directory, id))) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_NOT_FOUND,
        message: `No existe ninguna skill con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
  }

  /** Lee una skill que ya se sabe debería existir en `directory` (un directorio ya resuelto, nunca una raíz sin resolver). */
  private async readExisting(directory: string, id: string): Promise<Skill> {
    const skill = await this.repository.read(directory, id);
    if (!skill) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_NOT_FOUND,
        message: `No existe ninguna skill con id "${id}" en "${directory}".`,
        origin: "repository",
        recoverable: true,
      });
    }
    return skill;
  }

  /** Metadatos a usar al editar: si `SKILL.md` era legible, preserva su `createdAt`/`archived`; si estaba ausente o era inválido, los reconstruye a partir de la carpeta (reparación). */
  private async metadataForUpdate(directory: string, id: string): Promise<SkillMetadata> {
    try {
      const existing = await this.repository.read(directory, id);
      if (existing) return { ...existing.metadata, updatedAt: new Date().toISOString() };
    } catch (err) {
      if (
        !(err instanceof SkillError) ||
        (err.code !== SkillErrorCode.SKILL_FILE_MISSING &&
          err.code !== SkillErrorCode.SKILL_FILE_INVALID)
      ) {
        throw err;
      }
    }
    const stat = await this.repository.statSkillDir(directory, id);
    const now = new Date().toISOString();
    return { archived: false, createdAt: stat?.createdAt ?? now, updatedAt: now };
  }

  private async refreshIndex(root?: string): Promise<void> {
    const directory = this.resolveDirectory(root);
    const ids = await this.repository.listIds(directory);
    const summaries: SkillSummary[] = [];
    for (const id of ids) {
      summaries.push(await this.buildSummary(directory, id));
    }
    this.registry.replaceAll(summaries);
  }

  private async buildSummary(directory: string, id: string): Promise<SkillSummary> {
    try {
      const skill = await this.repository.read(directory, id);
      if (skill) return this.toSummary(skill);
    } catch (err) {
      if (
        !(err instanceof SkillError) ||
        (err.code !== SkillErrorCode.SKILL_FILE_MISSING &&
          err.code !== SkillErrorCode.SKILL_FILE_INVALID)
      ) {
        throw err;
      }
    }
    const stat = await this.repository.statSkillDir(directory, id);
    const now = new Date().toISOString();
    return {
      id,
      archived: false,
      createdAt: stat?.createdAt ?? now,
      updatedAt: stat?.updatedAt ?? now,
      hasSkillFile: false,
    };
  }

  private async persist(
    directory: string,
    id: string,
    content: string,
    metadata: SkillMetadata
  ): Promise<Skill> {
    await this.repository.write(directory, id, content, metadata);
    const skill: Skill = { id, content, metadata };
    this.registry.set(this.toSummary(skill));
    return skill;
  }

  private toSummary(skill: Skill): SkillSummary {
    const title = extractSkillTitle(skill.content);
    return {
      id: skill.id,
      archived: skill.metadata.archived,
      createdAt: skill.metadata.createdAt,
      updatedAt: skill.metadata.updatedAt,
      hasSkillFile: true,
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
    if (this.configManager) connected.push("config");
    if (this.verificationManager) connected.push("verification");
    return connected;
  }

  toStatusProvider(): StatusProvider {
    return {
      id: "skill-manager",
      getStatus: () => {
        let directory: string | undefined;
        try {
          directory = this.resolveDirectory();
        } catch {
          return makeStatusReport(
            "skill-manager",
            "UNKNOWN",
            "Todavía no se puede resolver el directorio de skills: escanea el Workspace con PSNAdapter primero."
          );
        }
        return makeStatusReport("skill-manager", "OK", "skill-manager responde correctamente.", {
          directory,
          skills: this.registry.list().length,
        });
      },
    };
  }

  private async afterMutation(directory: string): Promise<void> {
    if (this.configManager) {
      await this.configManager.setSection("skill-manager", {
        directory,
        skills: this.registry.list().length,
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
              `skill-manager: la verificación posterior a la operación reportó un problema: ${err instanceof Error ? err.message : String(err)}`
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
      await this.configManager.setSection("skill-manager", {
        integrations: this.listConnectedIntegrations(),
      });
    }

    context.reportStatus(SystemStatus.OK, "skill-manager inicializado");
  }

  async dispose(): Promise<void> {
    // Sin tareas programadas propias que cancelar.
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private async notify(phase: SkillEventPhase, skill: Skill): Promise<void> {
    await this.notifyById(phase, skill.id);
  }

  private async notifyById(phase: SkillEventPhase, skillId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`skill.${phase}`, { skillId }, { correlationId: skillId });
    }
    if (this.logger) {
      await this.logger.withCorrelationId(skillId).info(`skill:${phase} ${skillId}`);
    }
  }
}
