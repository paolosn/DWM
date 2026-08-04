import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { PSNAdapter, PSNResourceKind } from "@dwm/psn-adapter";
import type { AgentManager } from "@dwm/agent-manager";
import type { SkillManager } from "@dwm/skill-manager";
import type { RuleManager } from "@dwm/rule-manager";
import { createProjectProvisioningError } from "./errors/ProjectProvisioningError.js";
import { ProjectProvisioningErrorCode } from "./errors/ProjectProvisioningErrorCode.js";

export type SyncKind = "agent" | "skill" | "rule";

export type SyncAction = "create" | "update" | "unchanged" | "conflict";

export interface SyncPreview {
  readonly kind: SyncKind;
  readonly id: string;
  readonly action: SyncAction;
  /** Presente solo cuando `action === "conflict"`: explica por qué requiere confirmación explícita. */
  readonly reason?: string;
}

export interface AssignResult {
  readonly applied: boolean;
  readonly preview: SyncPreview;
}

export interface WithdrawResult {
  readonly withdrawn: boolean;
  readonly reason?: string;
}

export interface ContentSyncServiceOptions {
  readonly psnAdapter: PSNAdapter;
  readonly agentManager: AgentManager;
  readonly skillManager: SkillManager;
  readonly ruleManager: RuleManager;
}

const RESOURCE_KIND: Readonly<Record<SyncKind, PSNResourceKind>> = {
  agent: "agents",
  skill: "skills",
  rule: "rules",
};

/**
 * client-workflow "kilo-content-integration" (Commit 2) — motor real de
 * sincronización transaccional de Agentes/Skills/Reglas hacia el
 * `.kilo` real de un proyecto (o de un cliente, o del propio Workspace
 * global — cualquier carpeta ya escaneada por `@dwm/psn-adapter` sirve
 * como origen o destino). Reutiliza tal cual `AgentManager`/
 * `SkillManager`/`RuleManager` para leer y escribir el contenido real:
 * no crea un gestor de contenido paralelo, no duplica el modelo de
 * datos ni el almacenamiento — el sistema de ficheros del `.kilo` de
 * cada proyecto ES la única fuente de verdad de qué está asignado
 * (nunca hay un registro de asignaciones aparte que pueda
 * desincronizarse).
 *
 * Detección de conflictos: se compara el `content` real (ya sin el
 * bloque `dwm:` reservado — lo gestiona el propio manager) del origen
 * contra el del destino. Si son iguales, no hay nada que hacer. Si
 * difieren, es un conflicto real que exige confirmación explícita antes
 * de sobrescribir: nunca se asume que un fichero ya presente en el
 * destino es descartable, sea manual o sincronizado antes.
 */
export class ContentSyncService {
  private readonly psnAdapter: PSNAdapter;
  private readonly agentManager: AgentManager;
  private readonly skillManager: SkillManager;
  private readonly ruleManager: RuleManager;

  constructor(options: ContentSyncServiceOptions) {
    this.psnAdapter = options.psnAdapter;
    this.agentManager = options.agentManager;
    this.skillManager = options.skillManager;
    this.ruleManager = options.ruleManager;
  }

  /** Previsualiza lo que ocurriría al asignar `id` desde `sourceRoot` a `targetRoot`, sin escribir nada. */
  async previewAssign(
    kind: SyncKind,
    id: string,
    sourceRoot: string,
    targetRoot: string
  ): Promise<SyncPreview> {
    await this.ensureScanned(sourceRoot);
    await this.ensureScanned(targetRoot);

    const sourceContent = await this.readContent(kind, id, sourceRoot);
    if (sourceContent === undefined) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: `No existe ningún ${kind} con id "${id}" en el origen indicado.`,
        origin: "request",
        recoverable: true,
      });
    }

    const targetContent = await this.readContent(kind, id, targetRoot);
    if (targetContent === undefined) {
      return { kind, id, action: "create" };
    }
    if (targetContent === sourceContent) {
      return { kind, id, action: "unchanged" };
    }
    return {
      kind,
      id,
      action: "conflict",
      reason: `Ya existe un ${kind} con id "${id}" en el destino, con un contenido distinto al de origen. Sobrescribirlo requiere confirmación explícita.`,
    };
  }

  /**
   * Asigna (materializa) `id` en `targetRoot`. Nunca sobrescribe un
   * conflicto real sin `confirmOverwrite: true`. Atómico a nivel de
   * operación: si cualquier paso falla, se restaura exactamente el
   * estado que había en el destino antes de empezar (rollback
   * completo), incluidos los ficheros auxiliares de una skill.
   */
  async assign(
    kind: SyncKind,
    id: string,
    sourceRoot: string,
    targetRoot: string,
    options: { readonly confirmOverwrite?: boolean } = {}
  ): Promise<AssignResult> {
    const preview = await this.previewAssign(kind, id, sourceRoot, targetRoot);
    if (preview.action === "unchanged") {
      return { applied: false, preview };
    }
    if (preview.action === "conflict" && options.confirmOverwrite !== true) {
      return { applied: false, preview };
    }

    const rollback = await this.captureRollback(kind, id, targetRoot);
    try {
      await this.writeContent(kind, id, sourceRoot, targetRoot);
      return { applied: true, preview };
    } catch (err) {
      await rollback();
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
        message: `Fallo al asignar el ${kind} "${id}": se restauró el estado anterior del destino.`,
        origin: "copy",
        recoverable: true,
        cause: err,
      });
    }
  }

  /**
   * Retira `id` de `targetRoot` (elimina su materialización en ese
   * `.kilo`) sin afectar a ningún otro proyecto ni al origen. Segura:
   * si no existe en el destino, no hace nada y lo informa, en vez de
   * fallar.
   */
  async withdraw(kind: SyncKind, id: string, targetRoot: string): Promise<WithdrawResult> {
    await this.ensureScanned(targetRoot);
    const content = await this.readContent(kind, id, targetRoot);
    if (content === undefined) {
      return { withdrawn: false, reason: `No hay ningún ${kind} con id "${id}" en este proyecto.` };
    }
    await this.deleteContent(kind, id, targetRoot);
    return { withdrawn: true };
  }

  // -----------------------------------------------------------------
  // Internos
  // -----------------------------------------------------------------

  private async ensureScanned(root: string): Promise<void> {
    if (this.psnAdapter.getModel(root)) return;
    await this.psnAdapter.scanWorkspace(root);
  }

  private async readContent(kind: SyncKind, id: string, root: string): Promise<string | undefined> {
    try {
      if (kind === "agent") return (await this.agentManager.getAgent(id, root)).content;
      if (kind === "rule") return (await this.ruleManager.getRule(id, root)).content;
      return (await this.skillManager.getSkill(id, root)).content;
    } catch {
      return undefined;
    }
  }

  private async writeContent(
    kind: SyncKind,
    id: string,
    sourceRoot: string,
    targetRoot: string
  ): Promise<void> {
    if (kind === "agent") {
      const source = await this.agentManager.getAgent(id, sourceRoot);
      const exists = await this.agentManager
        .getAgent(id, targetRoot)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await this.agentManager.updateAgent(id, source.content, targetRoot);
      } else {
        await this.agentManager.createAgent({ id, content: source.content }, targetRoot);
      }
      return;
    }
    if (kind === "rule") {
      const source = await this.ruleManager.getRule(id, sourceRoot);
      const exists = await this.ruleManager
        .getRule(id, targetRoot)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await this.ruleManager.updateRule(id, source.content, targetRoot);
      } else {
        await this.ruleManager.createRule({ id, content: source.content }, targetRoot);
      }
      return;
    }
    await this.writeSkill(id, sourceRoot, targetRoot);
  }

  /** Copia SKILL.md (vía SkillManager) y, además, sus ficheros auxiliares (copia directa de ficheros, sin duplicar la lógica de SkillManager). */
  private async writeSkill(id: string, sourceRoot: string, targetRoot: string): Promise<void> {
    const source = await this.skillManager.getSkill(id, sourceRoot);
    const exists = await this.skillManager
      .getSkill(id, targetRoot)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      await this.skillManager.updateSkill(id, source.content, targetRoot);
    } else {
      await this.skillManager.createSkill({ id, content: source.content }, targetRoot);
    }

    const auxFiles = await this.skillManager.listAuxFiles(id, sourceRoot);
    const sourceSkillDir = path.join(this.resourceDir("skill", sourceRoot), id);
    const targetSkillDir = path.join(this.resourceDir("skill", targetRoot), id);
    for (const auxFile of auxFiles) {
      if (auxFile.isDirectory) continue;
      const from = path.join(sourceSkillDir, auxFile.relativePath);
      const to = path.join(targetSkillDir, auxFile.relativePath);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
  }

  private async deleteContent(kind: SyncKind, id: string, root: string): Promise<void> {
    if (kind === "agent") return this.agentManager.deleteAgent(id, root);
    if (kind === "rule") return this.ruleManager.deleteRule(id, root);
    return this.skillManager.deleteSkill(id, { confirmPermanent: true }, root);
  }

  private resourceDir(kind: SyncKind, root: string): string {
    const dir = this.psnAdapter.getResourcePath(RESOURCE_KIND[kind], root);
    if (!dir) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: `No se pudo resolver el directorio de "${RESOURCE_KIND[kind]}" en "${root}".`,
        origin: "request",
        recoverable: true,
      });
    }
    return dir;
  }

  /** Captura el estado real del destino antes de escribir, para poder restaurarlo exactamente si algo falla a mitad de la operación. */
  private async captureRollback(
    kind: SyncKind,
    id: string,
    targetRoot: string
  ): Promise<() => Promise<void>> {
    const before = await this.readContent(kind, id, targetRoot);
    const auxBackup = kind === "skill" ? await this.backupSkillAuxFiles(id, targetRoot) : undefined;

    return async () => {
      try {
        if (before === undefined) {
          await this.deleteContent(kind, id, targetRoot).catch(() => {});
        } else if (kind === "agent") {
          await this.agentManager.updateAgent(id, before, targetRoot).catch(() => {});
        } else if (kind === "rule") {
          await this.ruleManager.updateRule(id, before, targetRoot).catch(() => {});
        } else {
          await this.skillManager.updateSkill(id, before, targetRoot).catch(() => {});
        }
        if (auxBackup) await this.restoreSkillAuxFiles(id, targetRoot, auxBackup);
      } catch {
        // El rollback es un esfuerzo best-effort sobre un fallo ya ocurrido:
        // nunca debe enmascarar el error original que lo disparó.
      }
    };
  }

  private async backupSkillAuxFiles(
    id: string,
    root: string
  ): Promise<ReadonlyMap<string, Buffer | undefined>> {
    const backup = new Map<string, Buffer | undefined>();
    try {
      const auxFiles = await this.skillManager.listAuxFiles(id, root);
      const skillDir = path.join(this.resourceDir("skill", root), id);
      for (const auxFile of auxFiles) {
        if (auxFile.isDirectory) continue;
        const filePath = path.join(skillDir, auxFile.relativePath);
        backup.set(auxFile.relativePath, await fs.readFile(filePath).catch(() => undefined));
      }
    } catch {
      // Sin carpeta de skill previa: no hay auxiliares que respaldar.
    }
    return backup;
  }

  private async restoreSkillAuxFiles(
    id: string,
    root: string,
    backup: ReadonlyMap<string, Buffer | undefined>
  ): Promise<void> {
    const skillDir = path.join(this.resourceDir("skill", root), id);
    for (const [relativePath, contentBuffer] of backup) {
      const filePath = path.join(skillDir, relativePath);
      if (contentBuffer === undefined) continue;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, contentBuffer).catch(() => {});
    }
  }
}
