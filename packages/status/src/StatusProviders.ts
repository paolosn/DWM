import type { DWMCore } from "@dwm/core";
import { LifecycleState } from "@dwm/core";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManager } from "@dwm/plugin";
import type { BackupManager } from "@dwm/backup";
import type { RestoreManager } from "@dwm/restore";
import type { MigrationManager } from "@dwm/migration";
import type { VerificationManager } from "@dwm/verification";
import type { StatusLevel, StatusProvider, StatusReport } from "./StatusTypes.js";
import { makeStatusReport } from "./StatusTypes.js";

function notIntegrated(id: string, integration: string): StatusProvider {
  return {
    id,
    getStatus: () => makeStatusReport(id, "UNKNOWN", `No hay ${integration} integrado.`),
  };
}

async function safe(id: string, fn: () => Promise<void> | void): Promise<StatusReport> {
  try {
    await fn();
    return makeStatusReport(id, "OK", `${id} responde correctamente.`);
  } catch (err) {
    return makeStatusReport(id, "ERROR", err instanceof Error ? err.message : String(err));
  }
}

export function makeCoreProvider(core?: DWMCore): StatusProvider {
  if (!core) return notIntegrated("core", "DWMCore");
  return {
    id: "core",
    getStatus: () => {
      const state = core.getLifecycleState();
      let level: StatusLevel;
      if (state === LifecycleState.READY || state === LifecycleState.RUNNING) level = "OK";
      else if (state === LifecycleState.SHUTTING_DOWN || state === LifecycleState.STOPPED)
        level = "WARNING";
      else if (state === LifecycleState.ERROR) level = "ERROR";
      else level = "UNKNOWN";
      return makeStatusReport("core", level, `El Core está en estado "${state}".`, {
        lifecycleState: state,
      });
    },
  };
}

export function makeWorkspaceProvider(workspaceManager?: WorkspaceManager): StatusProvider {
  if (!workspaceManager) return notIntegrated("workspace", "WorkspaceManager");
  return {
    id: "workspace",
    getStatus: async () =>
      safe("workspace", () => {
        workspaceManager.listWorkspaces();
      }),
  };
}

export function makeConfigProvider(configManager?: ConfigManager): StatusProvider {
  if (!configManager) return notIntegrated("config", "ConfigManager");
  return {
    id: "config",
    getStatus: async () =>
      safe("config", async () => {
        await configManager.listNamespaces();
      }),
  };
}

export function makeSecretsProvider(secretsManager?: SecretsManager): StatusProvider {
  if (!secretsManager) return notIntegrated("secrets", "SecretsManager");
  return {
    id: "secrets",
    getStatus: async () =>
      safe("secrets", async () => {
        await secretsManager.listKeys();
      }),
  };
}

export function makeAIProvider(aiManager?: AIManager): StatusProvider {
  if (!aiManager) return notIntegrated("ai-manager", "AIManager");
  return {
    id: "ai-manager",
    getStatus: async () => {
      try {
        const providers = aiManager.listProviders();
        if (providers.length === 0) {
          return makeStatusReport("ai-manager", "WARNING", "No hay proveedores de IA registrados.");
        }
        const healthy = await aiManager.checkHealth();
        return makeStatusReport(
          "ai-manager",
          healthy ? "OK" : "WARNING",
          healthy
            ? "El proveedor de IA activo responde correctamente."
            : "El proveedor de IA activo no responde.",
          { providers: providers.length }
        );
      } catch (err) {
        return makeStatusReport(
          "ai-manager",
          "ERROR",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  };
}

export function makeProfileProvider(profileManager?: ProfileManager): StatusProvider {
  if (!profileManager) return notIntegrated("profile", "ProfileManager");
  return {
    id: "profile",
    getStatus: async () =>
      safe("profile", () => {
        profileManager.listProfiles();
      }),
  };
}

export function makeProjectProvider(projectManager?: ProjectManager): StatusProvider {
  if (!projectManager) return notIntegrated("project", "ProjectManager");
  return {
    id: "project",
    getStatus: async () =>
      safe("project", () => {
        projectManager.listProjects();
      }),
  };
}

export function makePluginProvider(pluginManager?: PluginManager): StatusProvider {
  if (!pluginManager) return notIntegrated("plugin", "PluginManager");
  return {
    id: "plugin",
    getStatus: async () => {
      try {
        const healthResults = await pluginManager.checkAllHealth();
        const hasFailed = healthResults.some((h) => h.status === "failed");
        const hasUnavailable = healthResults.some((h) => h.status === "unavailable");
        const level: StatusLevel = hasFailed ? "ERROR" : hasUnavailable ? "WARNING" : "OK";
        return makeStatusReport("plugin", level, `${healthResults.length} plugin(s) evaluados.`, {
          total: healthResults.length,
        });
      } catch (err) {
        return makeStatusReport(
          "plugin",
          "ERROR",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  };
}

export function makeBackupProvider(backupManager?: BackupManager): StatusProvider {
  if (!backupManager) return notIntegrated("backup", "BackupManager");
  return {
    id: "backup",
    getStatus: async () => {
      try {
        const ids = backupManager.listBackups();
        const hasFailed = ids.some((id) => backupManager.getBackup(id)?.state === "failed");
        return makeStatusReport(
          "backup",
          hasFailed ? "WARNING" : "OK",
          `${ids.length} backup(s) registrados.`,
          {
            total: ids.length,
          }
        );
      } catch (err) {
        return makeStatusReport(
          "backup",
          "ERROR",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  };
}

export function makeRestoreProvider(restoreManager?: RestoreManager): StatusProvider {
  if (!restoreManager) return notIntegrated("restore", "RestoreManager");
  return {
    id: "restore",
    getStatus: async () => {
      try {
        const ids = restoreManager.listRestores();
        const hasFailed = ids.some((id) => restoreManager.getRestore(id)?.state === "failed");
        return makeStatusReport(
          "restore",
          hasFailed ? "WARNING" : "OK",
          `${ids.length} restauración(es) registradas.`,
          { total: ids.length }
        );
      } catch (err) {
        return makeStatusReport(
          "restore",
          "ERROR",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  };
}

export function makeMigrationProvider(migrationManager?: MigrationManager): StatusProvider {
  if (!migrationManager) return notIntegrated("migration", "MigrationManager");
  return {
    id: "migration",
    getStatus: async () => {
      try {
        const ids = migrationManager.listMigrations();
        const hasFailed = ids.some((id) => migrationManager.getMigration(id)?.state === "failed");
        return makeStatusReport(
          "migration",
          hasFailed ? "WARNING" : "OK",
          `${ids.length} migración(es) registradas.`,
          { total: ids.length }
        );
      } catch (err) {
        return makeStatusReport(
          "migration",
          "ERROR",
          err instanceof Error ? err.message : String(err)
        );
      }
    },
  };
}

export function makeVerificationProvider(
  verificationManager?: VerificationManager
): StatusProvider {
  if (!verificationManager) return notIntegrated("verification", "VerificationManager");
  return {
    id: "verification",
    getStatus: async () =>
      safe("verification", () => {
        verificationManager.listVerifications();
      }),
  };
}
