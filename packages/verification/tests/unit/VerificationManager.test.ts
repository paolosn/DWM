import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { ProjectManager } from "@dwm/project";
import { PluginManager, StaticPluginSource } from "@dwm/plugin";
import { BackupManager, LocalBackupProvider } from "@dwm/backup";
import { VerificationManager } from "../../src/VerificationManager.js";
import { VerificationErrorCode } from "../../src/errors/VerificationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("VerificationManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-verification-core-"));
  }
  function makeManager(overrides: Record<string, unknown> = {}) {
    return new VerificationManager({ historyDir: tempDir(), ...overrides });
  }

  it("rechaza opciones sin historyDir válido", () => {
    expect(() => new VerificationManager({ historyDir: "" })).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST })
    );
  });

  describe("verificación completa y selectiva", () => {
    it("sin ninguna integración, la verificación completa termina 'completed'", async () => {
      const manager = makeManager();
      const result = await manager.verify();
      expect(result.state).toBe("completed");
      expect(result.categories.length).toBe(13);
      expect(result.summary.fail).toBe(0);
    });

    it("verificación selectiva ejecuta solo las categorías indicadas", async () => {
      const manager = makeManager();
      const result = await manager.verify({ categories: ["projects", "backups"] });
      expect(result.categories).toEqual(["projects", "backups"]);
      expect(
        result.checks.every((c) => c.category === "projects" || c.category === "backups")
      ).toBe(true);
    });

    it("rechaza una solicitud inválida", async () => {
      const manager = makeManager();
      await expect(manager.verify({ categories: [] })).rejects.toMatchObject({
        code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST,
      });
    });
  });

  describe("integración real con ProjectManager y ConfigManager", () => {
    it("detecta el estado 'pass' de proyectos y configuración reales", async () => {
      const projectManager = new ProjectManager({ projectsDir: tempDir() });
      await projectManager.createProject("Demo", "desc", {
        projectPath: tempDir(),
        profileId: "profile-1",
        usedTools: [],
        usedAdapters: [],
      });

      const configManager = new ConfigManager({ configDir: tempDir() });
      await configManager.setSection("ns1", { a: 1 });

      const manager = makeManager({ projectManager, configManager });
      const result = await manager.verify({ categories: ["projects", "config"] });

      expect(result.state).toBe("completed");
      expect(result.checks.some((c) => c.category === "projects" && c.status === "pass")).toBe(
        true
      );
      expect(result.checks.some((c) => c.category === "config" && c.status === "pass")).toBe(true);
    });
  });

  describe("integración real con BackupManager (integrity y backups)", () => {
    it("reporta integridad 'pass' para un backup válido", async () => {
      const provider = new LocalBackupProvider(tempDir());
      const backupManager = new BackupManager({ catalogDir: tempDir(), providers: [provider] });
      await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const manager = makeManager({ backupManager });
      const result = await manager.verify({ categories: ["backups", "integrity"] });

      expect(result.state).toBe("completed");
      expect(result.checks.some((c) => c.category === "integrity" && c.status === "pass")).toBe(
        true
      );
    });

    it("dryRun omite la verificación de integridad con E/S", async () => {
      const provider = new LocalBackupProvider(tempDir());
      const backupManager = new BackupManager({ catalogDir: tempDir(), providers: [provider] });
      await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const manager = makeManager({ backupManager });
      const result = await manager.verify({ categories: ["integrity"], dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.checks).toHaveLength(1);
      expect(result.checks[0]?.checkId).toBe("integrity:skipped");
    });

    it("detecta un backup corrupto y termina 'failed'", async () => {
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({ catalogDir: tempDir(), providers: [provider] });
      const backup = await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });
      const fs = await import("node:fs/promises");
      await fs.writeFile(
        `${storageDir}/dest/${backup.backupId}.json`,
        '{"manipulado":true}',
        "utf-8"
      );

      const manager = makeManager({ backupManager });
      const result = await manager.verify({ categories: ["integrity"] });

      expect(result.state).toBe("failed");
      expect(result.summary.fail).toBeGreaterThan(0);
    });
  });

  describe("agregación de estado", () => {
    it("un plugin descubierto pero nunca instalado produce 'warning' y termina 'completed_with_warnings'", async () => {
      const pluginManager = new PluginManager({ pluginsDir: tempDir(), dwmVersion: "1.0.0" });
      await pluginManager.discoverPlugins(
        new StaticPluginSource([
          {
            id: "p1",
            name: "P1",
            version: "1.0.0",
            description: "d",
            author: "a",
            entryPoint: "index.js",
            minDwmVersion: "1.0.0",
            dependencies: [],
            moduleDependencies: [],
            permissions: [],
            capabilities: { provided: [] },
          },
        ])
      );

      const manager = makeManager({ pluginManager });
      const result = await manager.verify({ categories: ["plugins"] });

      expect(result.state).toBe("completed_with_warnings");
      expect(result.checks.some((c) => c.resourceId === "p1" && c.status === "warning")).toBe(true);
    });

    it("una comprobación con estado 'fail' hace que la verificación entera termine 'failed'", async () => {
      const backupManager = {
        listBackups: () => ["b1"],
        getBackup: () => undefined,
        verifyIntegrity: async () => ({ status: "valid", issues: [] }),
      };
      const manager = makeManager({ backupManager: backupManager as never });
      const result = await manager.verify({ categories: ["backups"] });
      expect(result.state).toBe("failed");
    });
  });

  describe("consulta, historial y concurrencia", () => {
    it("getVerification()/listVerifications()/filterVerifications() reflejan el historial", async () => {
      const manager = makeManager();
      const result = await manager.verify({ categories: ["projects"] });

      expect(manager.listVerifications()).toEqual([result.verificationId]);
      expect(manager.filterVerifications({ category: "projects" })).toEqual([
        result.verificationId,
      ]);
      expect(manager.getVerification("no-existe")).toBeUndefined();
    });

    it("loadFromPersistence() reconstruye el historial desde disco", async () => {
      const historyDir = tempDir();
      const manager1 = new VerificationManager({ historyDir });
      const result = await manager1.verify({ categories: ["projects"] });

      const manager2 = new VerificationManager({ historyDir });
      const restored = await manager2.loadFromPersistence();

      expect(restored).toEqual([result.verificationId]);
      expect(manager2.getVerification(result.verificationId)?.state).toBe("completed");
    });

    it("rechaza una segunda verificación concurrente", async () => {
      const manager = makeManager();
      const first = manager.verify();
      await expect(manager.verify()).rejects.toMatchObject({
        code: VerificationErrorCode.VERIFICATION_OPERATION_CONFLICT,
      });
      await first;
    });

    it("libera el bloqueo tras completar, permitiendo una siguiente verificación", async () => {
      const manager = makeManager();
      await manager.verify();
      await expect(manager.verify()).resolves.toMatchObject({ state: "completed" });
    });
  });

  describe("eventos, logging e integraciones", () => {
    it("publica eventos completos a través de un EventBus inyectado", async () => {
      const published: string[] = [];
      const fakeBus = {
        publish: async (type: string) => {
          published.push(type);
          return {
            eventId: "e",
            type,
            matched: 0,
            delivered: 0,
            cancelledByMiddleware: false,
            propagationStopped: false,
            errors: [],
          };
        },
      };
      const manager = makeManager({ eventBus: fakeBus as never });
      await manager.verify({ categories: ["projects"] });

      expect(published).toEqual(
        ["requested", "started", "completed"].map((p) => `verification.${p}`)
      );
    });

    it("registra el ciclo de vida a través de un Logger inyectado", async () => {
      const logs: string[] = [];
      const fakeLogger = {
        withCorrelationId: () => ({
          info: async (m: string) => void logs.push(m),
          error: async (m: string) => void logs.push(m),
        }),
      };
      const manager = makeManager({ logger: fakeLogger as never });
      await manager.verify({ categories: ["projects"] });

      expect(logs.some((m) => m.includes("verification:requested"))).toBe(true);
      expect(logs.some((m) => m.includes("verification:completed"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ configManager });
      const result = await manager.verify({ categories: ["projects"] });

      await core.registerModule(manager);

      const section = await configManager.getSection<{ verifications: string[] }>(
        "verification-manager"
      );
      expect(section?.verifications).toEqual([result.verificationId]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real, y puede verificarse a sí mismo vía 'dependencies'", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const manager = makeManager({ core });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "verification-manager", status: "OK" }),
      ]);

      const result = await manager.verify({ categories: ["dependencies", "compatibility"] });
      expect(
        result.checks.some((c) => c.resourceId === "verification-manager" && c.status === "pass")
      ).toBe(true);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() no lanza (sin tareas programadas propias)", async () => {
      const manager = makeManager();
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
