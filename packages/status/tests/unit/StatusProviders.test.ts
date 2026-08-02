import { describe, it, expect } from "vitest";
import { LifecycleState } from "@dwm/core";
import * as providers from "../../src/StatusProviders.js";

describe("makeCoreProvider", () => {
  it("sin DWMCore, reporta UNKNOWN", async () => {
    const report = await providers.makeCoreProvider().getStatus();
    expect(report.level).toBe("UNKNOWN");
  });

  it("traduce READY/RUNNING a OK, SHUTTING_DOWN/STOPPED a WARNING, ERROR a ERROR, el resto a UNKNOWN", async () => {
    for (const [state, expected] of [
      [LifecycleState.READY, "OK"],
      [LifecycleState.RUNNING, "OK"],
      [LifecycleState.SHUTTING_DOWN, "WARNING"],
      [LifecycleState.STOPPED, "WARNING"],
      [LifecycleState.ERROR, "ERROR"],
      [LifecycleState.BOOTSTRAPPING, "UNKNOWN"],
    ] as const) {
      const core = { getLifecycleState: () => state };
      const report = await providers.makeCoreProvider(core as never).getStatus();
      expect(report.level).toBe(expected);
    }
  });
});

describe("makeWorkspaceProvider", () => {
  it("sin WorkspaceManager, reporta UNKNOWN", async () => {
    expect((await providers.makeWorkspaceProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK si listWorkspaces() no lanza", async () => {
    const workspaceManager = { listWorkspaces: () => [] };
    expect(
      (await providers.makeWorkspaceProvider(workspaceManager as never).getStatus()).level
    ).toBe("OK");
  });

  it("reporta ERROR si listWorkspaces() lanza", async () => {
    const workspaceManager = {
      listWorkspaces: () => {
        throw new Error("boom");
      },
    };
    const report = await providers.makeWorkspaceProvider(workspaceManager as never).getStatus();
    expect(report.level).toBe("ERROR");
    expect(report.message).toContain("boom");
  });
});

describe("makeConfigProvider", () => {
  it("sin ConfigManager, reporta UNKNOWN", async () => {
    expect((await providers.makeConfigProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK/ERROR según listNamespaces()", async () => {
    const ok = { listNamespaces: async () => [] };
    expect((await providers.makeConfigProvider(ok as never).getStatus()).level).toBe("OK");

    const bad = {
      listNamespaces: async () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeConfigProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeSecretsProvider", () => {
  it("sin SecretsManager, reporta UNKNOWN", async () => {
    expect((await providers.makeSecretsProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK/ERROR según listKeys(), sin tocar valores", async () => {
    const ok = { listKeys: async () => ["k1"] };
    expect((await providers.makeSecretsProvider(ok as never).getStatus()).level).toBe("OK");

    const bad = {
      listKeys: async () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeSecretsProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeAIProvider", () => {
  it("sin AIManager, reporta UNKNOWN", async () => {
    expect((await providers.makeAIProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta WARNING si no hay proveedores de IA registrados", async () => {
    const aiManager = { listProviders: () => [] };
    const report = await providers.makeAIProvider(aiManager as never).getStatus();
    expect(report.level).toBe("WARNING");
  });

  it("reporta OK/WARNING según checkHealth()", async () => {
    const healthy = { listProviders: () => ["p1"], checkHealth: async () => true };
    expect((await providers.makeAIProvider(healthy as never).getStatus()).level).toBe("OK");

    const unhealthy = { listProviders: () => ["p1"], checkHealth: async () => false };
    expect((await providers.makeAIProvider(unhealthy as never).getStatus()).level).toBe("WARNING");
  });

  it("reporta ERROR si checkHealth() lanza", async () => {
    const failing = {
      listProviders: () => ["p1"],
      checkHealth: async () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeAIProvider(failing as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeProfileProvider", () => {
  it("sin ProfileManager, reporta UNKNOWN; con manager, OK/ERROR", async () => {
    expect((await providers.makeProfileProvider().getStatus()).level).toBe("UNKNOWN");
    const ok = { listProfiles: () => [] };
    expect((await providers.makeProfileProvider(ok as never).getStatus()).level).toBe("OK");
    const bad = {
      listProfiles: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeProfileProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeProjectProvider", () => {
  it("sin ProjectManager, reporta UNKNOWN; con manager, OK/ERROR", async () => {
    expect((await providers.makeProjectProvider().getStatus()).level).toBe("UNKNOWN");
    const ok = { listProjects: () => [] };
    expect((await providers.makeProjectProvider(ok as never).getStatus()).level).toBe("OK");
    const bad = {
      listProjects: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeProjectProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makePluginProvider", () => {
  it("sin PluginManager, reporta UNKNOWN", async () => {
    expect((await providers.makePluginProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reutiliza checkAllHealth() y agrega el peor nivel", async () => {
    const allHealthy = {
      checkAllHealth: async () => [{ pluginId: "p1", status: "healthy", checkedAt: "now" }],
    };
    expect((await providers.makePluginProvider(allHealthy as never).getStatus()).level).toBe("OK");

    const someUnavailable = {
      checkAllHealth: async () => [
        { pluginId: "p1", status: "healthy", checkedAt: "now" },
        { pluginId: "p2", status: "unavailable", checkedAt: "now" },
      ],
    };
    expect((await providers.makePluginProvider(someUnavailable as never).getStatus()).level).toBe(
      "WARNING"
    );

    const someFailed = {
      checkAllHealth: async () => [
        { pluginId: "p1", status: "failed", checkedAt: "now" },
        { pluginId: "p2", status: "unavailable", checkedAt: "now" },
      ],
    };
    expect((await providers.makePluginProvider(someFailed as never).getStatus()).level).toBe(
      "ERROR"
    );
  });

  it("reporta ERROR si checkAllHealth() lanza", async () => {
    const failing = {
      checkAllHealth: async () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makePluginProvider(failing as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeBackupProvider", () => {
  it("sin BackupManager, reporta UNKNOWN", async () => {
    expect((await providers.makeBackupProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK si no hay backups fallidos, WARNING si hay alguno", async () => {
    const ok = { listBackups: () => ["b1"], getBackup: () => ({ state: "completed" }) };
    expect((await providers.makeBackupProvider(ok as never).getStatus()).level).toBe("OK");

    const warn = { listBackups: () => ["b1"], getBackup: () => ({ state: "failed" }) };
    expect((await providers.makeBackupProvider(warn as never).getStatus()).level).toBe("WARNING");
  });

  it("reporta ERROR si listBackups() lanza", async () => {
    const bad = {
      listBackups: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeBackupProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeRestoreProvider", () => {
  it("sin RestoreManager, reporta UNKNOWN", async () => {
    expect((await providers.makeRestoreProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK/WARNING/ERROR según el catálogo", async () => {
    const ok = { listRestores: () => ["r1"], getRestore: () => ({ state: "completed" }) };
    expect((await providers.makeRestoreProvider(ok as never).getStatus()).level).toBe("OK");

    const warn = { listRestores: () => ["r1"], getRestore: () => ({ state: "failed" }) };
    expect((await providers.makeRestoreProvider(warn as never).getStatus()).level).toBe("WARNING");

    const bad = {
      listRestores: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeRestoreProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeMigrationProvider", () => {
  it("sin MigrationManager, reporta UNKNOWN", async () => {
    expect((await providers.makeMigrationProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK/WARNING/ERROR según el catálogo", async () => {
    const ok = { listMigrations: () => ["m1"], getMigration: () => ({ state: "completed" }) };
    expect((await providers.makeMigrationProvider(ok as never).getStatus()).level).toBe("OK");

    const warn = { listMigrations: () => ["m1"], getMigration: () => ({ state: "failed" }) };
    expect((await providers.makeMigrationProvider(warn as never).getStatus()).level).toBe(
      "WARNING"
    );

    const bad = {
      listMigrations: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeMigrationProvider(bad as never).getStatus()).level).toBe("ERROR");
  });
});

describe("makeVerificationProvider", () => {
  it("sin VerificationManager, reporta UNKNOWN", async () => {
    expect((await providers.makeVerificationProvider().getStatus()).level).toBe("UNKNOWN");
  });

  it("reporta OK/ERROR según listVerifications()", async () => {
    const ok = { listVerifications: () => [] };
    expect((await providers.makeVerificationProvider(ok as never).getStatus()).level).toBe("OK");

    const bad = {
      listVerifications: () => {
        throw new Error("boom");
      },
    };
    expect((await providers.makeVerificationProvider(bad as never).getStatus()).level).toBe(
      "ERROR"
    );
  });
});
