import { SystemStatus, isValidSemver, type DWMCore } from "@dwm/core";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { CheckResult } from "./CheckResult.js";

function skip(category: CheckResult["category"], integration: string): CheckResult[] {
  return [
    {
      category,
      checkId: `${category}:integration`,
      status: "pass",
      message: `No hay ${integration} integrado; comprobación omitida.`,
    },
  ];
}

export function checkProjects(projectManager?: ProjectManager): CheckResult[] {
  if (!projectManager) return skip("projects", "ProjectManager");
  const ids = projectManager.listProjects();
  const results: CheckResult[] = [
    {
      category: "projects",
      checkId: "projects:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} proyecto(s) registrados.`,
    },
  ];
  for (const id of ids) {
    const project = projectManager.getProject(id);
    if (!project || project.id !== id) {
      results.push({
        category: "projects",
        checkId: "projects:resolve",
        status: "fail",
        message: `El proyecto "${id}" está listado pero no se pudo resolver de forma consistente.`,
        resourceId: id,
      });
      continue;
    }
    results.push({
      category: "projects",
      checkId: "projects:resolve",
      status: "pass",
      message: `El proyecto "${id}" es consistente.`,
      resourceId: id,
    });
  }
  return results;
}

export function checkWorkspaces(workspaceManager?: WorkspaceManager): CheckResult[] {
  if (!workspaceManager) return skip("workspaces", "WorkspaceManager");
  const workspaces = workspaceManager.listWorkspaces();
  const results: CheckResult[] = [
    {
      category: "workspaces",
      checkId: "workspaces:catalog",
      status: "pass",
      message: `Se encontraron ${workspaces.length} workspace(s) registrados.`,
    },
  ];
  for (const workspace of workspaces) {
    const resolved = workspaceManager.getWorkspace(workspace.id);
    if (!resolved || resolved.id !== workspace.id) {
      results.push({
        category: "workspaces",
        checkId: "workspaces:resolve",
        status: "fail",
        message: `El workspace "${workspace.id}" está listado pero no se pudo resolver de forma consistente.`,
        resourceId: workspace.id,
      });
      continue;
    }
    results.push({
      category: "workspaces",
      checkId: "workspaces:resolve",
      status: "pass",
      message: `El workspace "${workspace.id}" es consistente.`,
      resourceId: workspace.id,
    });
  }
  return results;
}

export function checkProfiles(profileManager?: ProfileManager): CheckResult[] {
  if (!profileManager) return skip("profiles", "ProfileManager");
  const ids = profileManager.listProfiles();
  const results: CheckResult[] = [
    {
      category: "profiles",
      checkId: "profiles:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} perfil(es) registrados.`,
    },
  ];
  for (const id of ids) {
    const profile = profileManager.getProfile(id);
    if (!profile || profile.id !== id) {
      results.push({
        category: "profiles",
        checkId: "profiles:resolve",
        status: "fail",
        message: `El perfil "${id}" está listado pero no se pudo resolver de forma consistente.`,
        resourceId: id,
      });
      continue;
    }
    results.push({
      category: "profiles",
      checkId: "profiles:resolve",
      status: "pass",
      message: `El perfil "${id}" es consistente.`,
      resourceId: id,
    });
  }
  return results;
}

export async function checkConfig(configManager?: ConfigManager): Promise<CheckResult[]> {
  if (!configManager) return skip("config", "ConfigManager");
  const namespaces = await configManager.listNamespaces();
  const results: CheckResult[] = [
    {
      category: "config",
      checkId: "config:catalog",
      status: "pass",
      message: `Se encontraron ${namespaces.length} sección(es) de configuración.`,
    },
  ];
  for (const namespace of namespaces) {
    try {
      await configManager.getSection(namespace);
      results.push({
        category: "config",
        checkId: "config:resolve",
        status: "pass",
        message: `La sección de configuración "${namespace}" se pudo leer correctamente.`,
        resourceId: namespace,
      });
    } catch (err) {
      results.push({
        category: "config",
        checkId: "config:resolve",
        status: "fail",
        message: `Fallo al leer la sección de configuración "${namespace}": ${err instanceof Error ? err.message : String(err)}`,
        resourceId: namespace,
      });
    }
  }
  return results;
}

export async function checkSecrets(secretsManager?: SecretsManager): Promise<CheckResult[]> {
  if (!secretsManager) return skip("secrets", "SecretsManager");
  const keys = await secretsManager.listKeys();
  const results: CheckResult[] = [
    {
      category: "secrets",
      checkId: "secrets:catalog",
      status: "pass",
      message: `Se encontraron ${keys.length} secreto(s) registrados.`,
    },
  ];
  for (const key of keys) {
    try {
      const has = await secretsManager.hasSecret(key);
      results.push({
        category: "secrets",
        checkId: "secrets:resolve",
        status: has ? "pass" : "fail",
        message: has
          ? `El secreto "${key}" está disponible.`
          : `El secreto "${key}" está listado pero no se pudo confirmar su existencia.`,
        resourceId: key,
      });
    } catch (err) {
      results.push({
        category: "secrets",
        checkId: "secrets:resolve",
        status: "fail",
        message: `Fallo al comprobar el secreto "${key}": ${err instanceof Error ? err.message : String(err)}`,
        resourceId: key,
      });
    }
  }
  return results;
}

export async function checkPlugins(pluginManager?: PluginManager): Promise<CheckResult[]> {
  if (!pluginManager) return skip("plugins", "PluginManager");
  const ids = pluginManager.listPlugins();
  const results: CheckResult[] = [
    {
      category: "plugins",
      checkId: "plugins:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} plugin(s) registrados.`,
    },
  ];
  const healthResults = await pluginManager.checkAllHealth();
  for (const health of healthResults) {
    const status =
      health.status === "healthy" ? "pass" : health.status === "unavailable" ? "warning" : "fail";
    results.push({
      category: "plugins",
      checkId: "plugins:health",
      status,
      message: `El plugin "${health.pluginId}" reporta salud "${health.status}".`,
      resourceId: health.pluginId,
    });
  }
  return results;
}

export function checkBackups(backupManager?: BackupManager): CheckResult[] {
  if (!backupManager) return skip("backups", "BackupManager");
  const ids = backupManager.listBackups();
  const results: CheckResult[] = [
    {
      category: "backups",
      checkId: "backups:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} backup(s) registrados.`,
    },
  ];
  for (const id of ids) {
    const descriptor = backupManager.getBackup(id);
    if (!descriptor) {
      results.push({
        category: "backups",
        checkId: "backups:resolve",
        status: "fail",
        message: `El backup "${id}" está listado pero no se pudo resolver.`,
        resourceId: id,
      });
      continue;
    }
    const status =
      descriptor.state === "completed" || descriptor.state === "completed_with_warnings"
        ? "pass"
        : "warning";
    results.push({
      category: "backups",
      checkId: "backups:state",
      status,
      message: `El backup "${id}" está en estado "${descriptor.state}".`,
      resourceId: id,
    });
  }
  return results;
}

export function checkRestores(restoreManager?: RestoreManager): CheckResult[] {
  if (!restoreManager) return skip("restores", "RestoreManager");
  const ids = restoreManager.listRestores();
  const results: CheckResult[] = [
    {
      category: "restores",
      checkId: "restores:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} restauración(es) registradas.`,
    },
  ];
  for (const id of ids) {
    const descriptor = restoreManager.getRestore(id);
    if (!descriptor) {
      results.push({
        category: "restores",
        checkId: "restores:resolve",
        status: "fail",
        message: `La restauración "${id}" está listada pero no se pudo resolver.`,
        resourceId: id,
      });
      continue;
    }
    const status =
      descriptor.state === "completed" || descriptor.state === "completed_with_warnings"
        ? "pass"
        : "warning";
    results.push({
      category: "restores",
      checkId: "restores:state",
      status,
      message: `La restauración "${id}" está en estado "${descriptor.state}".`,
      resourceId: id,
    });
  }
  return results;
}

export function checkMigrations(migrationManager?: MigrationManager): CheckResult[] {
  if (!migrationManager) return skip("migrations", "MigrationManager");
  const ids = migrationManager.listMigrations();
  const results: CheckResult[] = [
    {
      category: "migrations",
      checkId: "migrations:catalog",
      status: "pass",
      message: `Se encontraron ${ids.length} migración(es) registradas.`,
    },
  ];
  for (const id of ids) {
    const descriptor = migrationManager.getMigration(id);
    if (!descriptor) {
      results.push({
        category: "migrations",
        checkId: "migrations:resolve",
        status: "fail",
        message: `La migración "${id}" está listada pero no se pudo resolver.`,
        resourceId: id,
      });
      continue;
    }
    const status =
      descriptor.state === "completed" || descriptor.state === "completed_with_warnings"
        ? "pass"
        : "warning";
    results.push({
      category: "migrations",
      checkId: "migrations:state",
      status,
      message: `La migración "${id}" (${descriptor.direction}) está en estado "${descriptor.state}".`,
      resourceId: id,
    });
  }
  return results;
}

export function checkDependencies(core?: DWMCore): CheckResult[] {
  if (!core) return skip("dependencies", "DWMCore");
  const modules = core.listModules();
  const results: CheckResult[] = [
    {
      category: "dependencies",
      checkId: "dependencies:catalog",
      status: "pass",
      message: `Se encontraron ${modules.length} módulo(s) registrados.`,
    },
  ];
  for (const module of modules) {
    const status =
      module.status === SystemStatus.OK
        ? "pass"
        : module.status === SystemStatus.WARNING
          ? "warning"
          : "fail";
    results.push({
      category: "dependencies",
      checkId: "dependencies:module-status",
      status,
      message: `El módulo "${module.id}" reporta estado "${module.status}".`,
      resourceId: module.id,
    });
  }
  return results;
}

export function checkCompatibility(core?: DWMCore): CheckResult[] {
  if (!core) return skip("compatibility", "DWMCore");
  const modules = core.listModules();
  const results: CheckResult[] = [];
  for (const module of modules) {
    if (!isValidSemver(module.version) || !isValidSemver(module.contractVersion)) {
      results.push({
        category: "compatibility",
        checkId: "compatibility:semver",
        status: "fail",
        message: `El módulo "${module.id}" declara una versión o contractVersion con formato inválido.`,
        resourceId: module.id,
      });
      continue;
    }
    if (module.status === SystemStatus.INCOMPATIBLE) {
      results.push({
        category: "compatibility",
        checkId: "compatibility:status",
        status: "fail",
        message: `El módulo "${module.id}" es incompatible con la versión actual del Core.`,
        resourceId: module.id,
      });
      continue;
    }
    results.push({
      category: "compatibility",
      checkId: "compatibility:status",
      status: "pass",
      message: `El módulo "${module.id}" es compatible.`,
      resourceId: module.id,
    });
  }
  if (results.length === 0) {
    results.push({
      category: "compatibility",
      checkId: "compatibility:catalog",
      status: "pass",
      message: "No hay módulos registrados que comprobar.",
    });
  }
  return results;
}

export async function checkIntegrity(
  backupManager?: BackupManager,
  dryRun = false
): Promise<CheckResult[]> {
  if (!backupManager) return skip("integrity", "BackupManager");
  if (dryRun) {
    return [
      {
        category: "integrity",
        checkId: "integrity:skipped",
        status: "pass",
        message: "dryRun activo: se omiten las comprobaciones de integridad con E/S.",
      },
    ];
  }
  const ids = backupManager.listBackups();
  const results: CheckResult[] = [];
  for (const id of ids) {
    try {
      const integrity = await backupManager.verifyIntegrity(id);
      const status =
        integrity.status === "valid"
          ? "pass"
          : integrity.status === "valid_with_warnings"
            ? "warning"
            : "fail";
      results.push({
        category: "integrity",
        checkId: "integrity:backup",
        status,
        message: `El backup "${id}" reporta integridad "${integrity.status}".`,
        resourceId: id,
      });
    } catch (err) {
      results.push({
        category: "integrity",
        checkId: "integrity:backup",
        status: "fail",
        message: `Fallo al verificar la integridad del backup "${id}": ${err instanceof Error ? err.message : String(err)}`,
        resourceId: id,
      });
    }
  }
  if (results.length === 0) {
    results.push({
      category: "integrity",
      checkId: "integrity:catalog",
      status: "pass",
      message: "No hay backups registrados que verificar.",
    });
  }
  return results;
}

export function checkConsistency(
  backupManager?: BackupManager,
  restoreManager?: RestoreManager,
  migrationManager?: MigrationManager
): CheckResult[] {
  const results: CheckResult[] = [];

  if (restoreManager && backupManager) {
    for (const id of restoreManager.listRestores()) {
      const descriptor = restoreManager.getRestore(id);
      if (descriptor && !backupManager.getBackup(descriptor.request.backupId)) {
        results.push({
          category: "consistency",
          checkId: "consistency:restore-backup",
          status: "warning",
          message: `La restauración "${id}" referencia el backup "${descriptor.request.backupId}", que ya no existe.`,
          resourceId: id,
        });
      }
    }
  }

  if (migrationManager) {
    for (const id of migrationManager.listMigrations()) {
      const descriptor = migrationManager.getMigration(id);
      if (!descriptor) continue;
      if (descriptor.backupId && backupManager && !backupManager.getBackup(descriptor.backupId)) {
        results.push({
          category: "consistency",
          checkId: "consistency:migration-backup",
          status: "warning",
          message: `La migración "${id}" referencia el backup "${descriptor.backupId}", que ya no existe.`,
          resourceId: id,
        });
      }
      if (
        descriptor.restoreId &&
        restoreManager &&
        !restoreManager.getRestore(descriptor.restoreId)
      ) {
        results.push({
          category: "consistency",
          checkId: "consistency:migration-restore",
          status: "warning",
          message: `La migración "${id}" referencia la restauración "${descriptor.restoreId}", que ya no existe.`,
          resourceId: id,
        });
      }
    }
  }

  if (backupManager) {
    for (const id of backupManager.listBackups()) {
      const descriptor = backupManager.getBackup(id);
      if (
        descriptor?.manifest.baseBackupId &&
        !backupManager.getBackup(descriptor.manifest.baseBackupId)
      ) {
        results.push({
          category: "consistency",
          checkId: "consistency:backup-chain",
          status: "fail",
          message: `El backup incremental "${id}" referencia el backup base "${descriptor.manifest.baseBackupId}", que ya no existe.`,
          resourceId: id,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      category: "consistency",
      checkId: "consistency:overall",
      status: "pass",
      message: "No se detectaron inconsistencias entre módulos.",
    });
  }
  return results;
}
