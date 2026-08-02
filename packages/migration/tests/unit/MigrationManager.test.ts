import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { BackupManager, LocalBackupProvider } from "@dwm/backup";
import { RestoreManager } from "@dwm/restore";
import { MigrationManager } from "../../src/MigrationManager.js";
import { MigrationErrorCode } from "../../src/errors/MigrationErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("MigrationManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-migration-core-"));
  }

  function makeStack(configManager: ConfigManager) {
    const storageDir = tempDir();
    const provider = new LocalBackupProvider(storageDir);
    const backupManager = new BackupManager({
      catalogDir: tempDir(),
      providers: [provider],
      configManager,
    });
    const restoreManager = new RestoreManager({
      historyDir: tempDir(),
      backupManager,
      providers: [provider],
      configManager,
    });
    return { backupManager, restoreManager, provider };
  }

  function makeMigrationManager(
    backupManager: BackupManager,
    restoreManager: RestoreManager,
    overrides: Record<string, unknown> = {}
  ) {
    return new MigrationManager({
      historyDir: tempDir(),
      backupManager,
      restoreManager,
      dwmVersion: "1.0.0",
      ...overrides,
    });
  }

  it("rechaza opciones inválidas o incompletas", () => {
    const configManager = new ConfigManager({ configDir: tempDir() });
    const { backupManager, restoreManager } = makeStack(configManager);
    expect(
      () =>
        new MigrationManager({ historyDir: "", backupManager, restoreManager, dwmVersion: "1.0.0" })
    ).toThrow(expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST }));
    expect(
      () =>
        new MigrationManager({
          historyDir: tempDir(),
          backupManager: undefined as never,
          restoreManager,
          dwmVersion: "1.0.0",
        })
    ).toThrow(expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST }));
    expect(
      () =>
        new MigrationManager({
          historyDir: tempDir(),
          backupManager,
          restoreManager,
          dwmVersion: "",
        })
    ).toThrow(expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST }));
  });

  describe("exportación", () => {
    it("exportMigration() crea el backup subyacente y registra la migración", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { valor: "original" });
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      const result = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });

      expect(result.direction).toBe("export");
      expect(result.state).toBe("completed");
      expect(result.backupId).toBeDefined();
      expect(backupManager.getBackup(result.backupId as string)?.state).toBe("completed");
    });

    it("exportMigration() rechaza una solicitud inválida", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      await expect(
        migrationManager.exportMigration({
          type: "full",
          resources: [],
          target: { providerId: "local", path: "dest" },
        })
      ).rejects.toMatchObject({ code: MigrationErrorCode.MIGRATION_INVALID_REQUEST });
    });
  });

  describe("importación completa y selectiva", () => {
    it("importMigration() restaura una sección de configuración real a través de RestoreManager", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { valor: "original" });
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { valor: "modificado" });

      const importResult = await migrationManager.importMigration({
        backupId: exportResult.backupId as string,
        conflictStrategy: "overwrite",
      });

      expect(importResult.direction).toBe("import");
      expect(importResult.state).toBe("completed");
      expect(importResult.restoreId).toBeDefined();
      expect(await configManager.getSection("ns1")).toEqual({ valor: "original" });
    });

    it("importMigration() selectivo filtra por tipo de recurso", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { a: 1 });
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      const exportResult = await migrationManager.exportMigration({
        type: "selective",
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "custom", resourceId: "c1" },
        ],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 999 });

      const importResult = await migrationManager.importMigration({
        backupId: exportResult.backupId as string,
        resourceTypes: ["config"],
        conflictStrategy: "overwrite",
      });

      expect(importResult.state).toBe("completed");
      expect(await configManager.getSection("ns1")).toEqual({ a: 1 });
    });

    it("importMigration() rechaza si el backup no existe", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      await expect(
        migrationManager.importMigration({ backupId: "no-existe" })
      ).rejects.toMatchObject({
        code: MigrationErrorCode.MIGRATION_BACKUP_NOT_FOUND,
      });
    });

    it("importMigration() rechaza una solicitud inválida", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      await expect(migrationManager.importMigration({ backupId: "" })).rejects.toMatchObject({
        code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
      });
    });
  });

  describe("compatibilidad de versión", () => {
    it("rechaza importar si el registro de exportación indica una versión de DWM mayor incompatible", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const historyDir = tempDir();

      const exporter = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "2.0.0",
      });
      const exportResult = await exporter.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const importer = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "1.0.0",
      });
      await importer.loadFromPersistence();

      await expect(
        importer.importMigration({ backupId: exportResult.backupId as string })
      ).rejects.toMatchObject({ code: MigrationErrorCode.MIGRATION_INCOMPATIBLE_VERSION });
    });

    it("acepta importar si la versión mayor de origen coincide con la local", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const historyDir = tempDir();

      const exporter = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "1.5.0",
      });
      const exportResult = await exporter.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const importer = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "1.0.0",
      });
      await importer.loadFromPersistence();

      await expect(
        importer.importMigration({ backupId: exportResult.backupId as string })
      ).resolves.toMatchObject({ state: "completed" });
    });
  });

  describe("resolución de conflictos", () => {
    it("estrategia 'fail' (por defecto) rechaza si hay conflicto", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { a: 1 });
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        configManager,
      });

      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });

      await expect(
        migrationManager.importMigration({ backupId: exportResult.backupId as string })
      ).rejects.toMatchObject({ code: MigrationErrorCode.MIGRATION_CONFLICT });
    });

    it("estrategia 'skip' omite los recursos en conflicto y continúa con el resto", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { a: 1 });
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        configManager,
      });

      const exportResult = await migrationManager.exportMigration({
        type: "selective",
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "custom", resourceId: "c1" },
        ],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 999 });

      const importResult = await migrationManager.importMigration({
        backupId: exportResult.backupId as string,
        conflictStrategy: "skip",
      });

      expect(importResult.state).toBe("completed_with_warnings");
      expect(importResult.warnings.length).toBeGreaterThan(0);
      expect(await configManager.getSection("ns1")).toEqual({ a: 999 });
    });

    it("estrategia 'overwrite' procede a pesar del conflicto", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { a: 1 });
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        configManager,
      });

      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 999 });

      const importResult = await migrationManager.importMigration({
        backupId: exportResult.backupId as string,
        conflictStrategy: "overwrite",
      });

      expect(importResult.state).toBe("completed");
      expect(await configManager.getSection("ns1")).toEqual({ a: 1 });
    });
  });

  describe("dry-run", () => {
    it("dryRun no modifica nada, pero completa correctamente", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      await configManager.setSection("ns1", { valor: "original" });
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { valor: "modificado" });

      const importResult = await migrationManager.importMigration({
        backupId: exportResult.backupId as string,
        conflictStrategy: "overwrite",
        dryRun: true,
      });

      expect(importResult.dryRun).toBe(true);
      expect(importResult.state).toBe("completed");
      expect(await configManager.getSection("ns1")).toEqual({ valor: "modificado" });
    });
  });

  describe("cancelación", () => {
    it("cancelMigration() sobre una migración recién creada en 'pending' la cancela de inmediato", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const promise = migrationManager
        .importMigration({ backupId: exportResult.backupId as string })
        .catch((err) => err);
      const migrationId = migrationManager
        .listMigrations()
        .find((id) => id !== exportResult.migrationId) as string;
      expect(migrationManager.getMigration(migrationId)?.state).toBe("pending");

      await migrationManager.cancelMigration(migrationId);

      expect(migrationManager.getMigration(migrationId)?.state).toBe("cancelled");
      await promise.catch(() => {});
    });

    it("cancelMigration() es idempotente si ya está cancelada", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const promise = migrationManager
        .importMigration({ backupId: exportResult.backupId as string })
        .catch((err) => err);
      const migrationId = migrationManager
        .listMigrations()
        .find((id) => id !== exportResult.migrationId) as string;
      await migrationManager.cancelMigration(migrationId);
      await expect(migrationManager.cancelMigration(migrationId)).resolves.toBeUndefined();
      await promise.catch(() => {});
    });

    it("cancelMigration() rechaza si la migración ya finalizó", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      const result = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      await expect(migrationManager.cancelMigration(result.migrationId)).rejects.toMatchObject({
        code: MigrationErrorCode.MIGRATION_CANCELLATION_NOT_ALLOWED,
      });
    });

    it("cancelMigration() lanza MIGRATION_NOT_FOUND si no existe", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      await expect(migrationManager.cancelMigration("no-existe")).rejects.toMatchObject({
        code: MigrationErrorCode.MIGRATION_NOT_FOUND,
      });
    });
  });

  describe("consulta, historial y concurrencia", () => {
    it("getMigration()/listMigrations()/filterMigrations() reflejan el historial", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      const result = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      expect(migrationManager.listMigrations()).toEqual([result.migrationId]);
      expect(migrationManager.filterMigrations({ direction: "export" })).toEqual([
        result.migrationId,
      ]);
      expect(migrationManager.getMigration("no-existe")).toBeUndefined();
    });

    it("loadFromPersistence() reconstruye el historial desde disco", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const historyDir = tempDir();
      const manager1 = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "1.0.0",
      });
      const result = await manager1.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const manager2 = new MigrationManager({
        historyDir,
        backupManager,
        restoreManager,
        dwmVersion: "1.0.0",
      });
      const restored = await manager2.loadFromPersistence();

      expect(restored).toEqual([result.migrationId]);
      expect(manager2.getMigration(result.migrationId)?.state).toBe("completed");
    });

    it("rechaza una segunda exportación concurrente al mismo destino", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      const request = {
        type: "full" as const,
        resources: [{ resourceType: "custom" as const, resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      };
      const first = migrationManager.exportMigration(request);
      await expect(migrationManager.exportMigration(request)).rejects.toMatchObject({
        code: MigrationErrorCode.MIGRATION_OPERATION_CONFLICT,
      });
      await first;
    });

    it("rechaza una segunda importación concurrente del mismo backup", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      const exportResult = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      const first = migrationManager.importMigration({ backupId: exportResult.backupId as string });
      await expect(
        migrationManager.importMigration({ backupId: exportResult.backupId as string })
      ).rejects.toMatchObject({ code: MigrationErrorCode.MIGRATION_OPERATION_CONFLICT });
      await first;
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
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        eventBus: fakeBus as never,
      });

      await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      expect(published).toEqual(
        ["requested", "preparing.started", "started", "completed"].map((p) => `migration.${p}`)
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
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        logger: fakeLogger as never,
      });

      await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      expect(logs.some((m) => m.includes("migration:requested"))).toBe(true);
      expect(logs.some((m) => m.includes("migration:completed"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager, {
        configManager,
      });
      const result = await migrationManager.exportMigration({
        type: "full",
        resources: [{ resourceType: "custom", resourceId: "r1" }],
        target: { providerId: "local", path: "dest" },
      });

      await core.registerModule(migrationManager);

      const section = await configManager.getSection<{ migrations: string[] }>("migration-manager");
      expect(section?.migrations).toEqual([result.migrationId]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);

      await core.registerModule(migrationManager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "migration-manager", status: "OK" }),
      ]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() no lanza (sin tareas programadas propias)", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, restoreManager } = makeStack(configManager);
      const migrationManager = makeMigrationManager(backupManager, restoreManager);
      await expect(migrationManager.dispose()).resolves.toBeUndefined();
    });
  });
});
