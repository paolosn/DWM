import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { BackupResource } from "./BackupResource.js";

export interface ResolvedBackupResource {
  readonly resource: BackupResource;
  readonly exists: boolean;
  /** Instantánea serializable del recurso; nunca contiene secretos en claro. */
  readonly snapshot?: unknown;
}

/**
 * Resuelve una referencia simbólica a un recurso respaldable en una
 * instantánea serializable, sin exponer nunca el valor de un secreto.
 */
export interface BackupSourceResolver {
  resolve(resource: BackupResource): Promise<ResolvedBackupResource>;
}

export interface ManagedBackupSourceResolverOptions {
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
}

/**
 * Resolutor por defecto: consulta los gestores de DWM ya integrados para
 * comprobar existencia y obtener una instantánea segura de cada recurso.
 * Si el gestor correspondiente no está integrado, la comprobación se omite
 * (se asume existente, sin instantánea), consistente con el patrón de
 * integraciones opcionales del resto del monorepo.
 */
export class ManagedBackupSourceResolver implements BackupSourceResolver {
  constructor(private readonly options: ManagedBackupSourceResolverOptions = {}) {}

  async resolve(resource: BackupResource): Promise<ResolvedBackupResource> {
    switch (resource.resourceType) {
      case "project": {
        if (!this.options.projectManager) return { resource, exists: true };
        const project = this.options.projectManager.getProject(resource.resourceId);
        return project
          ? {
              resource,
              exists: true,
              snapshot: { metadata: project.metadata, configuration: project.configuration },
            }
          : { resource, exists: false };
      }
      case "workspace": {
        if (!this.options.workspaceManager) return { resource, exists: true };
        const workspace = this.options.workspaceManager.getWorkspace(resource.resourceId);
        return workspace
          ? { resource, exists: true, snapshot: { metadata: workspace.metadata } }
          : { resource, exists: false };
      }
      case "profile": {
        if (!this.options.profileManager) return { resource, exists: true };
        const profile = this.options.profileManager.getProfile(resource.resourceId);
        return profile
          ? {
              resource,
              exists: true,
              snapshot: { metadata: profile.metadata, configuration: profile.configuration },
            }
          : { resource, exists: false };
      }
      case "plugin-metadata": {
        if (!this.options.pluginManager) return { resource, exists: true };
        const plugin = this.options.pluginManager.getPlugin(resource.resourceId);
        return plugin
          ? {
              resource,
              exists: true,
              snapshot: { manifest: plugin.manifest, metadata: plugin.metadata },
            }
          : { resource, exists: false };
      }
      case "config": {
        if (!this.options.configManager) return { resource, exists: true };
        const section = await this.options.configManager.getSection(resource.resourceId);
        return section !== undefined
          ? { resource, exists: true, snapshot: section }
          : { resource, exists: false };
      }
      case "secret-ref": {
        if (!this.options.secretsManager) return { resource, exists: true };
        const has = await this.options.secretsManager.hasSecret(resource.resourceId);
        return { resource, exists: has, snapshot: has ? { key: resource.resourceId } : undefined };
      }
      case "custom":
      default:
        return { resource, exists: true };
    }
  }
}
