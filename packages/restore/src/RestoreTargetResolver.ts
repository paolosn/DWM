import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupResource } from "@dwm/backup";
import { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
import { createRestoreError } from "./errors/RestoreError.js";

export interface RestoreApplyResult {
  /** `true` si el recurso se escribió realmente; `false` si solo se pudo verificar (o no había integración disponible). */
  readonly applied: boolean;
  readonly wasProtected: boolean;
  /** Valor previo capturado antes de sobrescribir, necesario para el rollback lógico. */
  readonly previousValue?: unknown;
  readonly warning?: string;
}

/**
 * Aplica (o, cuando no existe una vía de escritura segura y real, solo
 * verifica) el snapshot de un recurso restaurado. Nunca restaura el valor
 * de un secreto (nunca se capturó en el backup), y respeta las secciones
 * de configuración marcadas como protegidas salvo que se autorice
 * explícitamente.
 */
export interface RestoreTargetResolver {
  apply(
    resource: BackupResource,
    snapshot: unknown,
    options: { allowOverwriteProtected: boolean }
  ): Promise<RestoreApplyResult>;
  /** Revierte una aplicación previa usando el valor previo capturado por `apply()`. */
  rollback(resource: BackupResource, previousValue: unknown): Promise<void>;
}

export interface ManagedRestoreTargetResolverOptions {
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  /** Namespaces de configuración que no pueden sobrescribirse sin `allowOverwriteProtected`. */
  readonly protectedNamespaces?: readonly string[];
}

/**
 * Resolutor por defecto basado en los gestores de DWM ya integrados. Solo
 * `config` tiene una vía de escritura real y segura (`ConfigManager`); el
 * resto de tipos de recurso se verifican (existencia) sin sobrescritura
 * automática, evitando inventar métodos que no existen en los módulos
 * anteriores.
 */
export class ManagedRestoreTargetResolver implements RestoreTargetResolver {
  constructor(private readonly options: ManagedRestoreTargetResolverOptions = {}) {}

  async apply(
    resource: BackupResource,
    snapshot: unknown,
    options: { allowOverwriteProtected: boolean }
  ): Promise<RestoreApplyResult> {
    switch (resource.resourceType) {
      case "config": {
        if (!this.options.configManager) {
          return {
            applied: false,
            wasProtected: false,
            warning: `No hay ConfigManager integrado para restaurar "${resource.resourceId}".`,
          };
        }
        const wasProtected = (this.options.protectedNamespaces ?? []).includes(resource.resourceId);
        if (wasProtected && !options.allowOverwriteProtected) {
          throw createRestoreError({
            code: RestoreErrorCode.RESTORE_PROTECTED_RESOURCE,
            message: `La sección de configuración "${resource.resourceId}" está protegida y no puede sobrescribirse sin autorización explícita.`,
            origin: "target",
            recoverable: true,
          });
        }
        const previousValue = await this.options.configManager.getSection(resource.resourceId);
        await this.options.configManager.setSection(resource.resourceId, snapshot);
        return { applied: true, wasProtected, previousValue };
      }
      case "project":
        return this.verifyOnly(
          !!this.options.projectManager?.getProject(resource.resourceId),
          resource
        );
      case "workspace":
        return this.verifyOnly(
          !!this.options.workspaceManager?.getWorkspace(resource.resourceId),
          resource
        );
      case "profile":
        return this.verifyOnly(
          !!this.options.profileManager?.getProfile(resource.resourceId),
          resource
        );
      case "plugin-metadata":
        return this.verifyOnly(
          !!this.options.pluginManager?.getPlugin(resource.resourceId),
          resource
        );
      case "secret-ref":
        return {
          applied: false,
          wasProtected: false,
          warning: `Los secretos nunca se restauran automáticamente ("${resource.resourceId}"); deben reprovisionarse manualmente.`,
        };
      case "custom":
      default:
        return { applied: false, wasProtected: false };
    }
  }

  async rollback(resource: BackupResource, previousValue: unknown): Promise<void> {
    if (resource.resourceType !== "config" || !this.options.configManager) return;
    if (previousValue === undefined) {
      await this.options.configManager.deleteSection(resource.resourceId);
    } else {
      await this.options.configManager.setSection(resource.resourceId, previousValue);
    }
  }

  private verifyOnly(exists: boolean, resource: BackupResource): RestoreApplyResult {
    return {
      applied: false,
      wasProtected: false,
      ...(exists
        ? {}
        : {
            warning: `El recurso "${resource.resourceType}:${resource.resourceId}" ya no existe; no se puede recrear automáticamente.`,
          }),
    };
  }
}
