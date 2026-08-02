import { describe, it, expect } from "vitest";
import { SystemStatus } from "@dwm/core";
import * as checkers from "../../src/VerificationCheckers.js";

describe("checkProjects", () => {
  it("sin ProjectManager, omite con 'pass'", () => {
    const results = checkers.checkProjects();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });

  it("con proyectos consistentes, reporta 'pass'", () => {
    const projectManager = {
      listProjects: () => ["p1", "p2"],
      getProject: (id: string) => ({ id }),
    };
    const results = checkers.checkProjects(projectManager as never);
    expect(
      results.filter((r) => r.checkId === "projects:resolve").every((r) => r.status === "pass")
    ).toBe(true);
  });

  it("detecta un proyecto listado pero no resoluble", () => {
    const projectManager = {
      listProjects: () => ["p1"],
      getProject: () => undefined,
    };
    const results = checkers.checkProjects(projectManager as never);
    expect(results.some((r) => r.status === "fail")).toBe(true);
  });

  it("detecta inconsistencia de identidad", () => {
    const projectManager = {
      listProjects: () => ["p1"],
      getProject: () => ({ id: "otro" }),
    };
    const results = checkers.checkProjects(projectManager as never);
    expect(results.some((r) => r.status === "fail")).toBe(true);
  });
});

describe("checkWorkspaces", () => {
  it("sin WorkspaceManager, omite con 'pass'", () => {
    expect(checkers.checkWorkspaces()[0]?.status).toBe("pass");
  });

  it("con workspaces consistentes, reporta 'pass'; detecta inconsistencias", () => {
    const workspaceManager = {
      listWorkspaces: () => [{ id: "w1" }, { id: "w2" }],
      getWorkspace: (id: string) => (id === "w1" ? { id: "w1" } : undefined),
    };
    const results = checkers.checkWorkspaces(workspaceManager as never);
    const w1 = results.find((r) => r.resourceId === "w1");
    const w2 = results.find((r) => r.resourceId === "w2");
    expect(w1?.status).toBe("pass");
    expect(w2?.status).toBe("fail");
  });
});

describe("checkProfiles", () => {
  it("sin ProfileManager, omite con 'pass'", () => {
    expect(checkers.checkProfiles()[0]?.status).toBe("pass");
  });

  it("detecta perfiles consistentes e inconsistentes", () => {
    const profileManager = {
      listProfiles: () => ["pr1", "pr2"],
      getProfile: (id: string) => (id === "pr1" ? { id: "pr1" } : undefined),
    };
    const results = checkers.checkProfiles(profileManager as never);
    expect(results.find((r) => r.resourceId === "pr1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "pr2")?.status).toBe("fail");
  });
});

describe("checkConfig", () => {
  it("sin ConfigManager, omite con 'pass'", async () => {
    expect((await checkers.checkConfig())[0]?.status).toBe("pass");
  });

  it("reporta 'pass' si las secciones se leen correctamente", async () => {
    const configManager = {
      listNamespaces: async () => ["ns1"],
      getSection: async () => ({ a: 1 }),
    };
    const results = await checkers.checkConfig(configManager as never);
    expect(results.find((r) => r.resourceId === "ns1")?.status).toBe("pass");
  });

  it("reporta 'fail' si la lectura de una sección lanza", async () => {
    const configManager = {
      listNamespaces: async () => ["ns1"],
      getSection: async () => {
        throw new Error("boom");
      },
    };
    const results = await checkers.checkConfig(configManager as never);
    expect(results.find((r) => r.resourceId === "ns1")?.status).toBe("fail");
  });
});

describe("checkSecrets", () => {
  it("sin SecretsManager, omite con 'pass'", async () => {
    expect((await checkers.checkSecrets())[0]?.status).toBe("pass");
  });

  it("nunca invoca getSecret() (no toca valores)", async () => {
    let getSecretCalled = false;
    const secretsManager = {
      listKeys: async () => ["k1"],
      hasSecret: async () => true,
      getSecret: async () => {
        getSecretCalled = true;
        return "valor";
      },
    };
    const results = await checkers.checkSecrets(secretsManager as never);
    expect(results.find((r) => r.resourceId === "k1")?.status).toBe("pass");
    expect(getSecretCalled).toBe(false);
  });

  it("reporta 'fail' si hasSecret() devuelve false o lanza", async () => {
    const secretsManager1 = { listKeys: async () => ["k1"], hasSecret: async () => false };
    const results1 = await checkers.checkSecrets(secretsManager1 as never);
    expect(results1.find((r) => r.resourceId === "k1")?.status).toBe("fail");

    const secretsManager2 = {
      listKeys: async () => ["k1"],
      hasSecret: async () => {
        throw new Error("boom");
      },
    };
    const results2 = await checkers.checkSecrets(secretsManager2 as never);
    expect(results2.find((r) => r.resourceId === "k1")?.status).toBe("fail");
  });
});

describe("checkPlugins", () => {
  it("sin PluginManager, omite con 'pass'", async () => {
    expect((await checkers.checkPlugins())[0]?.status).toBe("pass");
  });

  it("reutiliza checkAllHealth() y traduce cada estado de salud", async () => {
    const pluginManager = {
      listPlugins: () => ["pl1", "pl2", "pl3"],
      checkAllHealth: async () => [
        { pluginId: "pl1", status: "healthy", checkedAt: "now" },
        { pluginId: "pl2", status: "unavailable", checkedAt: "now" },
        { pluginId: "pl3", status: "failed", checkedAt: "now" },
      ],
    };
    const results = await checkers.checkPlugins(pluginManager as never);
    expect(results.find((r) => r.resourceId === "pl1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "pl2")?.status).toBe("warning");
    expect(results.find((r) => r.resourceId === "pl3")?.status).toBe("fail");
  });
});

describe("checkBackups", () => {
  it("sin BackupManager, omite con 'pass'", () => {
    expect(checkers.checkBackups()[0]?.status).toBe("pass");
  });

  it("traduce el estado de catálogo de cada backup", () => {
    const backupManager = {
      listBackups: () => ["b1", "b2", "b3"],
      getBackup: (id: string) =>
        ({ b1: { state: "completed" }, b2: { state: "failed" } })[id as "b1" | "b2"] ?? undefined,
    };
    const results = checkers.checkBackups(backupManager as never);
    expect(results.find((r) => r.resourceId === "b1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "b2")?.status).toBe("warning");
    expect(results.find((r) => r.resourceId === "b3")?.status).toBe("fail");
  });
});

describe("checkRestores", () => {
  it("sin RestoreManager, omite con 'pass'", () => {
    expect(checkers.checkRestores()[0]?.status).toBe("pass");
  });

  it("traduce el estado de catálogo de cada restauración", () => {
    const restoreManager = {
      listRestores: () => ["r1", "r2"],
      getRestore: (id: string) => (id === "r1" ? { state: "completed" } : undefined),
    };
    const results = checkers.checkRestores(restoreManager as never);
    expect(results.find((r) => r.resourceId === "r1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "r2")?.status).toBe("fail");
  });
});

describe("checkMigrations", () => {
  it("sin MigrationManager, omite con 'pass'", () => {
    expect(checkers.checkMigrations()[0]?.status).toBe("pass");
  });

  it("traduce el estado de catálogo de cada migración", () => {
    const migrationManager = {
      listMigrations: () => ["m1", "m2"],
      getMigration: (id: string) =>
        id === "m1" ? { state: "completed", direction: "export" } : undefined,
    };
    const results = checkers.checkMigrations(migrationManager as never);
    expect(results.find((r) => r.resourceId === "m1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "m2")?.status).toBe("fail");
  });
});

describe("checkDependencies", () => {
  it("sin DWMCore, omite con 'pass'", () => {
    expect(checkers.checkDependencies()[0]?.status).toBe("pass");
  });

  it("traduce el estado de cada módulo registrado", () => {
    const core = {
      listModules: () => [
        { id: "m1", version: "1.0.0", contractVersion: "1.0.0", status: SystemStatus.OK },
        { id: "m2", version: "1.0.0", contractVersion: "1.0.0", status: SystemStatus.WARNING },
        { id: "m3", version: "1.0.0", contractVersion: "1.0.0", status: SystemStatus.ERROR },
      ],
    };
    const results = checkers.checkDependencies(core as never);
    expect(results.find((r) => r.resourceId === "m1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "m2")?.status).toBe("warning");
    expect(results.find((r) => r.resourceId === "m3")?.status).toBe("fail");
  });
});

describe("checkCompatibility", () => {
  it("sin DWMCore, omite con 'pass'", () => {
    expect(checkers.checkCompatibility()[0]?.status).toBe("pass");
  });

  it("reporta 'pass' para módulos compatibles con semver válido", () => {
    const core = {
      listModules: () => [
        { id: "m1", version: "1.0.0", contractVersion: "1.0.0", status: SystemStatus.OK },
      ],
    };
    const results = checkers.checkCompatibility(core as never);
    expect(results.find((r) => r.resourceId === "m1")?.status).toBe("pass");
  });

  it("reporta 'fail' si la versión/contractVersion no es semver válido", () => {
    const core = {
      listModules: () => [
        { id: "m1", version: "no-semver", contractVersion: "1.0.0", status: SystemStatus.OK },
      ],
    };
    const results = checkers.checkCompatibility(core as never);
    expect(results.find((r) => r.resourceId === "m1")?.status).toBe("fail");
  });

  it("reporta 'fail' si el módulo está marcado como INCOMPATIBLE", () => {
    const core = {
      listModules: () => [
        { id: "m1", version: "1.0.0", contractVersion: "1.0.0", status: SystemStatus.INCOMPATIBLE },
      ],
    };
    const results = checkers.checkCompatibility(core as never);
    expect(results.find((r) => r.resourceId === "m1")?.status).toBe("fail");
  });

  it("reporta 'pass' si no hay módulos registrados", () => {
    const core = { listModules: () => [] };
    const results = checkers.checkCompatibility(core as never);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });
});

describe("checkIntegrity", () => {
  it("sin BackupManager, omite con 'pass'", async () => {
    expect((await checkers.checkIntegrity())[0]?.status).toBe("pass");
  });

  it("con dryRun, omite la verificación de integridad con E/S", async () => {
    const backupManager = {
      listBackups: () => ["b1"],
      verifyIntegrity: async () => ({ status: "valid", issues: [] }),
    };
    const results = await checkers.checkIntegrity(backupManager as never, true);
    expect(results).toHaveLength(1);
    expect(results[0]?.checkId).toBe("integrity:skipped");
  });

  it("reutiliza verifyIntegrity() y traduce cada estado", async () => {
    const backupManager = {
      listBackups: () => ["b1", "b2", "b3"],
      verifyIntegrity: async (id: string) => {
        if (id === "b1") return { status: "valid", issues: [] };
        if (id === "b2") return { status: "valid_with_warnings", issues: ["aviso"] };
        return { status: "invalid", issues: ["roto"] };
      },
    };
    const results = await checkers.checkIntegrity(backupManager as never, false);
    expect(results.find((r) => r.resourceId === "b1")?.status).toBe("pass");
    expect(results.find((r) => r.resourceId === "b2")?.status).toBe("warning");
    expect(results.find((r) => r.resourceId === "b3")?.status).toBe("fail");
  });

  it("reporta 'fail' si verifyIntegrity() lanza", async () => {
    const backupManager = {
      listBackups: () => ["b1"],
      verifyIntegrity: async () => {
        throw new Error("boom");
      },
    };
    const results = await checkers.checkIntegrity(backupManager as never, false);
    expect(results.find((r) => r.resourceId === "b1")?.status).toBe("fail");
  });

  it("reporta 'pass' si no hay backups que verificar", async () => {
    const backupManager = {
      listBackups: () => [],
      verifyIntegrity: async () => ({ status: "valid", issues: [] }),
    };
    const results = await checkers.checkIntegrity(backupManager as never, false);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });
});

describe("checkConsistency", () => {
  it("sin ninguna integración, reporta 'pass' (nada que comprobar)", () => {
    const results = checkers.checkConsistency();
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("pass");
  });

  it("detecta una restauración que referencia un backup inexistente", () => {
    const backupManager = { listBackups: () => [], getBackup: () => undefined };
    const restoreManager = {
      listRestores: () => ["r1"],
      getRestore: () => ({ request: { backupId: "no-existe" } }),
    };
    const results = checkers.checkConsistency(backupManager as never, restoreManager as never);
    expect(
      results.some((r) => r.checkId === "consistency:restore-backup" && r.status === "warning")
    ).toBe(true);
  });

  it("detecta una migración que referencia un backup o restauración inexistentes", () => {
    const backupManager = { listBackups: () => [], getBackup: () => undefined };
    const restoreManager = { listRestores: () => [], getRestore: () => undefined };
    const migrationManager = {
      listMigrations: () => ["m1"],
      getMigration: () => ({ backupId: "b-no-existe", restoreId: "r-no-existe" }),
    };
    const results = checkers.checkConsistency(
      backupManager as never,
      restoreManager as never,
      migrationManager as never
    );
    expect(results.some((r) => r.checkId === "consistency:migration-backup")).toBe(true);
    expect(results.some((r) => r.checkId === "consistency:migration-restore")).toBe(true);
  });

  it("detecta un backup incremental cuya base ya no existe", () => {
    const backupManager = {
      listBackups: () => ["b1"],
      getBackup: (id: string) =>
        id === "b1" ? { manifest: { baseBackupId: "base-no-existe" } } : undefined,
    };
    const results = checkers.checkConsistency(backupManager as never);
    expect(
      results.some((r) => r.checkId === "consistency:backup-chain" && r.status === "fail")
    ).toBe(true);
  });
});
