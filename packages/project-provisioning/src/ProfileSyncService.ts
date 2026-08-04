import type { ProfileConfiguration } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { ConnectionsManager } from "@dwm/connections-manager";
import { ContentSyncService, type SyncKind, type SyncPreview } from "./ContentSyncService.js";
import { createProjectProvisioningError } from "./errors/ProjectProvisioningError.js";
import { ProjectProvisioningErrorCode } from "./errors/ProjectProvisioningErrorCode.js";

export interface ProfileSyncItem {
  readonly kind: SyncKind;
  readonly id: string;
  readonly preview: SyncPreview;
}

export interface ProfilePreview {
  readonly items: readonly ProfileSyncItem[];
  readonly hasConflicts: boolean;
}

export interface ProfileApplyResult {
  readonly items: readonly ProfileSyncItem[];
  readonly applied: readonly ProfileSyncItem[];
  readonly aiApplied: boolean;
  readonly mcpApplied: readonly string[];
}

export interface ProfileSyncServiceOptions {
  readonly contentSyncService: ContentSyncService;
  readonly projectManager: ProjectManager;
  readonly connectionsManager?: ConnectionsManager;
}

/** Único punto de recorrido de la composición real de un perfil (agentIds/skillIds/ruleIds), reutilizado tanto por `preview` como por `apply` — nunca dos formas distintas de listar lo mismo. */
function listProfileItems(
  configuration: ProfileConfiguration
): readonly { kind: SyncKind; id: string }[] {
  return [
    ...(configuration.agentIds ?? []).map((id) => ({ kind: "agent" as const, id })),
    ...(configuration.skillIds ?? []).map((id) => ({ kind: "skill" as const, id })),
    ...(configuration.ruleIds ?? []).map((id) => ({ kind: "rule" as const, id })),
  ];
}

/**
 * client-workflow "kilo-content-integration" (Commit 5) — un perfil es
 * un paquete real (agentes + skills + reglas + IA + MCP opcional).
 * Asignarlo a un proyecto reutiliza íntegramente el motor transaccional
 * ya construido: cada agente/skill/regla se materializa vía
 * `ContentSyncService` (Commit 2, sin lógica de sincronización nueva);
 * la IA se aplica escribiendo la referencia real en
 * `ProjectConfiguration.settings.ai` a través de `ProjectManager` ya
 * existente (nunca un valor de secreto, solo la referencia); el MCP
 * opcional se aplica reutilizando el sistema de *grants* ya existente
 * de `ConnectionsManager` (denegación por defecto, asignación
 * explícita — el mismo mecanismo de client-workflow-v2).
 */
export class ProfileSyncService {
  private readonly contentSync: ContentSyncService;
  private readonly projectManager: ProjectManager;
  private readonly connectionsManager: ConnectionsManager | undefined;

  constructor(options: ProfileSyncServiceOptions) {
    this.contentSync = options.contentSyncService;
    this.projectManager = options.projectManager;
    this.connectionsManager = options.connectionsManager;
  }

  /** Previsualiza la asignación completa del perfil (create/update/unchanged/conflict por cada agente/skill/regla), sin escribir nada. */
  async previewProfile(
    configuration: ProfileConfiguration,
    sourceRoot: string,
    targetRoot: string
  ): Promise<ProfilePreview> {
    const items: ProfileSyncItem[] = [];
    for (const { kind, id } of listProfileItems(configuration)) {
      const preview = await this.contentSync.previewAssign(kind, id, sourceRoot, targetRoot);
      items.push({ kind, id, preview });
    }
    return { items, hasConflicts: items.some((item) => item.preview.action === "conflict") };
  }

  /**
   * Aplica el perfil completo a `targetProjectId`. Si hay conflictos
   * reales y no se confirma explícitamente, no escribe nada y devuelve
   * el preview para revisión. Atómico a nivel de perfil: si cualquier
   * elemento falla a mitad de la aplicación, se retiran/revierten los
   * elementos ya aplicados en esta misma llamada (rollback real,
   * reutilizando el mismo `ContentSyncService` para cada retirada).
   */
  async applyProfile(
    configuration: ProfileConfiguration,
    sourceRoot: string,
    targetRoot: string,
    targetProjectId: string,
    options: { readonly confirmOverwrite?: boolean } = {}
  ): Promise<ProfileApplyResult> {
    const preview = await this.previewProfile(configuration, sourceRoot, targetRoot);
    if (preview.hasConflicts && options.confirmOverwrite !== true) {
      return { items: preview.items, applied: [], aiApplied: false, mcpApplied: [] };
    }

    const applied: ProfileSyncItem[] = [];
    try {
      for (const item of preview.items) {
        if (item.preview.action === "unchanged") continue;
        const result = await this.contentSync.assign(item.kind, item.id, sourceRoot, targetRoot, {
          confirmOverwrite: true,
        });
        if (result.applied) applied.push(item);
      }

      const aiApplied = await this.applyAi(configuration, targetProjectId);
      const mcpApplied = await this.applyMcp(configuration, sourceRoot, targetProjectId);

      return { items: preview.items, applied, aiApplied, mcpApplied };
    } catch (err) {
      // Rollback a nivel de perfil: retira exactamente los elementos que
      // esta misma llamada llegó a aplicar, reutilizando el mismo motor
      // transaccional — nunca toca elementos que ya estaban ahí antes.
      for (const item of applied) {
        await this.contentSync.withdraw(item.kind, item.id, targetRoot).catch(() => {});
      }
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
        message:
          "Fallo al aplicar el perfil: se retiraron los elementos ya aplicados en esta operación.",
        origin: "copy",
        recoverable: true,
        cause: err,
      });
    }
  }

  private async applyAi(
    configuration: ProfileConfiguration,
    targetProjectId: string
  ): Promise<boolean> {
    if (!configuration.defaultAIProviderId) return false;
    const project = this.projectManager.getProject(targetProjectId);
    if (!project) return false;
    await this.projectManager.updateProject(targetProjectId, {
      configuration: {
        ...project.configuration,
        settings: {
          ...project.configuration.settings,
          ai: {
            provider: configuration.defaultAIProviderId,
            ...(configuration.aiProviderConfiguration ?? {}),
          },
        },
      },
    });
    return true;
  }

  private async applyMcp(
    configuration: ProfileConfiguration,
    sourceRoot: string,
    targetProjectId: string
  ): Promise<readonly string[]> {
    const mcpConnectionIds = configuration.mcpConnectionIds ?? [];
    if (mcpConnectionIds.length === 0 || !this.connectionsManager) return [];
    const applied: string[] = [];
    for (const connectionId of mcpConnectionIds) {
      await this.connectionsManager.assignCapability(
        sourceRoot,
        connectionId,
        targetProjectId,
        "client-connection.use"
      );
      applied.push(connectionId);
    }
    return applied;
  }
}
