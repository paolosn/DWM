import type { ConfigManager } from "@dwm/config";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupResource } from "@dwm/backup";

export interface MigrationConflict {
  readonly resource: BackupResource;
}

export interface MigrationConflictDetectorOptions {
  readonly configManager?: ConfigManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly pluginManager?: PluginManager;
}

/**
 * Detecta, para cada recurso incluido en una migración, si ya existe
 * localmente (lo que representaría un conflicto al importar). Solo
 * consulta (nunca modifica) los gestores ya integrados; si un gestor no
 * está disponible, ese tipo de recurso simplemente no se comprueba.
 */
export class MigrationConflictDetector {
  constructor(private readonly options: MigrationConflictDetectorOptions = {}) {}

  async detect(resources: readonly BackupResource[]): Promise<MigrationConflict[]> {
    const conflicts: MigrationConflict[] = [];
    for (const resource of resources) {
      if (await this.exists(resource)) conflicts.push({ resource });
    }
    return conflicts;
  }

  private async exists(resource: BackupResource): Promise<boolean> {
    switch (resource.resourceType) {
      case "config":
        return this.options.configManager
          ? this.options.configManager.hasSection(resource.resourceId)
          : false;
      case "project":
        return !!this.options.projectManager?.getProject(resource.resourceId);
      case "workspace":
        return !!this.options.workspaceManager?.getWorkspace(resource.resourceId);
      case "profile":
        return !!this.options.profileManager?.getProfile(resource.resourceId);
      case "plugin-metadata":
        return !!this.options.pluginManager?.getPlugin(resource.resourceId);
      case "secret-ref":
      case "custom":
      default:
        return false;
    }
  }
}
