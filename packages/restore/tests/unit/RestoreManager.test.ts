import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { BackupManager, LocalBackupProvider } from "@dwm/backup";
import { RestoreManager } from "../../src/RestoreManager.js";
import { RestoreErrorCode } from "../../src/errors/RestoreErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("RestoreManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-restore-core-"));
  }

  async function makeBackupWithConfig(configManager: ConfigManager) {
    const storageDir = tempDir();
    const provider = new LocalBackupProvider(storageDir);
    const backupManager = new BackupManager({
      catalogDir: tempDir(),
      providers: [provider],
      configManager,
    });
    await configManager.setSection("ns1", { valor: "original" });
    const backup = await backupManager.createBackup({
      type: "full",
      resources: [{ resourceType: "config", resourceId: "ns1" }],
      target: { providerId: "local", path: "dest" },
    });
    return { backupManager, provider, backup };
  }

  function makeRestoreManager(
    backupManager: BackupManager,
    provider: LocalBackupProvider,
    overrides: Record<string, unknown> = {}
  ) {
    return new RestoreManager({
      historyDir: tempDir(),
      backupManager,
      providers: [provider],
      ...overrides,
    });
  }

  it("rechaza opciones sin historyDir, backupManager o providers válidos", () => {
    const backupManager = new BackupManager({
      catalogDir: tempDir(),
      providers: [new LocalBackupProvider(tempDir())],
    });
    const provider = new LocalBackupProvider(tempDir());
    expect(
      () => new RestoreManager({ historyDir: "", backupManager, providers: [provider] })
    ).toThrow(expect.objectContaining({ code: RestoreErrorCode.RESTORE_INVALID_REQUEST }));
    expect(
      () =>
        new RestoreManager({
          historyDir: tempDir(),
          backupManager: undefined as never,
          providers: [provider],
        })
    ).toThrow(expect.objectContaining({ code: RestoreErrorCode.RESTORE_INVALID_REQUEST }));
    expect(
      () => new RestoreManager({ historyDir: tempDir(), backupManager, providers: [] })
    ).toThrow(expect.objectContaining({ code: RestoreErrorCode.RESTORE_INVALID_REQUEST }));
  });

  describe("restauración completa y selectiva", () => {
    it("restoreBackup() completo restaura una sección de configuración real", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      await configManager.setSection("ns1", { valor: "modificado" });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({ backupId: backup.backupId });

      expect(result.state).toBe("completed");
      expect(result.itemsRestored).toBe(1);
      expect(await configManager.getSection("ns1")).toEqual({ valor: "original" });
    });

    it("restoreBackup() selectivo filtra por tipo de recurso", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });
      await configManager.setSection("ns1", { a: 1 });
      const backup = await backupManager.createBackup({
        type: "selective",
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "custom", resourceId: "c1" },
        ],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 999 });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({
        backupId: backup.backupId,
        resourceTypes: ["config"],
      });

      expect(result.itemsRestored).toBe(1);
      expect(await configManager.getSection("ns1")).toEqual({ a: 1 });
    });
  });

  describe("restauración incremental", () => {
    it("restoreBackup() incremental fusiona la cadena base + cambios", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });

      await configManager.setSection("ns1", { a: 1 });
      await configManager.setSection("ns2", { b: 1 });
      const base = await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });

      await configManager.setSection("ns2", { b: 2 });
      const incremental = await backupManager.createBackup({
        type: "incremental",
        baseBackupId: base.backupId,
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "config", resourceId: "ns2" },
        ],
        target: { providerId: "local", path: "dest" },
      });

      await configManager.setSection("ns1", { a: 999 });
      await configManager.setSection("ns2", { b: 999 });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({ backupId: incremental.backupId });

      expect(result.state).toBe("completed");
      expect(await configManager.getSection("ns1")).toEqual({ a: 1 });
      expect(await configManager.getSection("ns2")).toEqual({ b: 2 });
    });

    it("restoreBackup() incremental rechaza si un eslabón profundo de la cadena falta (más allá de lo que BackupManager verifica superficialmente)", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });
      await configManager.setSection("ns1", { a: 1 });
      const root = await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 2 });
      const middle = await backupManager.createBackup({
        type: "incremental",
        baseBackupId: root.backupId,
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: 3 });
      const leaf = await backupManager.createBackup({
        type: "incremental",
        baseBackupId: middle.backupId,
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });

      await backupManager.deleteBackup(root.backupId, { force: true });

      // BackupManager.verifyIntegrity(leaf) solo comprueba que "middle" exista (sigue existiendo);
      // no valida recursivamente que "root" también exista.
      await expect(backupManager.verifyIntegrity(leaf.backupId)).resolves.toMatchObject({
        status: "valid",
      });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      await expect(restoreManager.restoreBackup({ backupId: leaf.backupId })).rejects.toMatchObject(
        {
          code: RestoreErrorCode.RESTORE_INVALID_CHAIN,
        }
      );
    });

    it("restoreBackup() incremental rechaza si el backup base no existe (detectado por la integridad del propio backup)", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });
      await configManager.setSection("ns1", { a: 1 });
      const base = await backupManager.createBackup({
        type: "full",
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      const incremental = await backupManager.createBackup({
        type: "incremental",
        baseBackupId: base.backupId,
        resources: [{ resourceType: "config", resourceId: "ns1" }],
        target: { providerId: "local", path: "dest" },
      });
      await backupManager.deleteBackup(base.backupId, { force: true });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      await expect(
        restoreManager.restoreBackup({ backupId: incremental.backupId })
      ).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_BACKUP_CORRUPTED,
      });
    });
  });

  describe("validaciones previas", () => {
    it("restoreBackup() rechaza una solicitud inválida", async () => {
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
      });
      const provider = new LocalBackupProvider(tempDir());
      const restoreManager = makeRestoreManager(backupManager, provider);
      await expect(restoreManager.restoreBackup({ backupId: "" })).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
      });
    });

    it("restoreBackup() rechaza un backup inexistente", async () => {
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
      });
      const provider = new LocalBackupProvider(tempDir());
      const restoreManager = makeRestoreManager(backupManager, provider);
      await expect(restoreManager.restoreBackup({ backupId: "no-existe" })).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_BACKUP_NOT_FOUND,
      });
    });

    it("restoreBackup() rechaza un backup corrupto", async () => {
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

      const restoreManager = makeRestoreManager(backupManager, provider);
      await expect(
        restoreManager.restoreBackup({ backupId: backup.backupId })
      ).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_BACKUP_CORRUPTED,
      });
    });
  });

  describe("dry-run", () => {
    it("dryRun no modifica nada, pero cuenta los elementos que se restaurarían", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      await configManager.setSection("ns1", { valor: "modificado" });

      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({
        backupId: backup.backupId,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.itemsRestored).toBe(1);
      expect(await configManager.getSection("ns1")).toEqual({ valor: "modificado" });
    });
  });

  describe("protección de recursos", () => {
    it("rechaza restaurar una sección protegida sin autorización, y lo permite con allowOverwriteProtected", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);

      const restoreManager = makeRestoreManager(backupManager, provider, {
        configManager,
        protectedNamespaces: ["ns1"],
      });

      await expect(
        restoreManager.restoreBackup({ backupId: backup.backupId })
      ).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_PROTECTED_RESOURCE,
      });

      const result = await restoreManager.restoreBackup({
        backupId: backup.backupId,
        allowOverwriteProtected: true,
      });
      expect(result.state).toBe("completed");
    });
  });

  describe("rollback lógico", () => {
    it("revierte los cambios ya aplicados si falla a mitad de la restauración", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });
      await configManager.setSection("ns1", { a: "original" });
      await configManager.setSection("ns2", { b: "original" });
      const backup = await backupManager.createBackup({
        type: "full",
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "config", resourceId: "ns2" },
        ],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: "modificado" });
      await configManager.setSection("ns2", { b: "modificado" });

      let calls = 0;
      const resolver = {
        apply: async (resource: { resourceId: string }, snapshot: unknown) => {
          calls += 1;
          if (resource.resourceId === "ns1") {
            const previousValue = await configManager.getSection("ns1");
            await configManager.setSection("ns1", snapshot);
            return { applied: true, wasProtected: false, previousValue };
          }
          throw new Error("fallo simulado al restaurar ns2");
        },
        rollback: async (resource: { resourceId: string }, previousValue: unknown) => {
          await configManager.setSection(resource.resourceId, previousValue);
        },
      };

      const restoreManager = makeRestoreManager(backupManager, provider, {
        configManager,
        targetResolver: resolver as never,
      });

      await expect(
        restoreManager.restoreBackup({ backupId: backup.backupId })
      ).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_APPLY_FAILED,
      });

      expect(calls).toBe(2);
      expect(await configManager.getSection("ns1")).toEqual({ a: "modificado" });

      const restoreId = restoreManager.listRestores()[0] as string;
      expect(restoreManager.getRestore(restoreId)?.state).toBe("failed");
    });
  });

  describe("cancelación", () => {
    it("cancelRestore() sobre una restauración recién creada en 'pending' la cancela de inmediato", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });

      const promise = restoreManager.restoreBackup({ backupId: backup.backupId });
      const restoreId = restoreManager.listRestores()[0] as string;
      expect(restoreManager.getRestore(restoreId)?.state).toBe("pending");

      await restoreManager.cancelRestore(restoreId);

      expect(restoreManager.getRestore(restoreId)?.state).toBe("rolled_back");
      await promise.catch(() => {});
    });

    it("cancelRestore() cooperativo detiene una restauración en curso y revierte lo aplicado", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const storageDir = tempDir();
      const provider = new LocalBackupProvider(storageDir);
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [provider],
        configManager,
      });
      await configManager.setSection("ns1", { a: "original" });
      const backup = await backupManager.createBackup({
        type: "full",
        resources: [
          { resourceType: "config", resourceId: "ns1" },
          { resourceType: "custom", resourceId: "c1" },
        ],
        target: { providerId: "local", path: "dest" },
      });
      await configManager.setSection("ns1", { a: "modificado" });

      let releaseSecond!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseSecond = resolve;
      });
      const realResolver = {
        apply: async (
          resource: { resourceType: string; resourceId: string },
          snapshot: unknown
        ) => {
          if (resource.resourceType === "config") {
            const previousValue = await configManager.getSection(resource.resourceId);
            await configManager.setSection(resource.resourceId, snapshot);
            return { applied: true, wasProtected: false, previousValue };
          }
          await gate;
          return { applied: false, wasProtected: false };
        },
        rollback: async (
          resource: { resourceType: string; resourceId: string },
          previousValue: unknown
        ) => {
          if (resource.resourceType === "config") {
            await configManager.setSection(resource.resourceId, previousValue);
          }
        },
      };

      const restoreManager = makeRestoreManager(backupManager, provider, {
        configManager,
        targetResolver: realResolver as never,
      });

      const promise = restoreManager.restoreBackup({ backupId: backup.backupId });
      await new Promise((r) => setTimeout(r, 10));
      const restoreId = restoreManager.listRestores()[0] as string;

      await restoreManager.cancelRestore(restoreId);
      releaseSecond();

      const result = await promise;
      expect(result.state).toBe("rolled_back");
      expect(await configManager.getSection("ns1")).toEqual({ a: "modificado" });
    });

    it("cancelRestore() es idempotente si ya está finalizada la cancelación", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });

      const promise = restoreManager.restoreBackup({ backupId: backup.backupId });
      const restoreId = restoreManager.listRestores()[0] as string;
      await restoreManager.cancelRestore(restoreId);
      await expect(restoreManager.cancelRestore(restoreId)).resolves.toBeUndefined();
      await promise.catch(() => {});
    });

    it("cancelRestore() rechaza si la restauración ya finalizó", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({ backupId: backup.backupId });

      await expect(restoreManager.cancelRestore(result.restoreId)).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_CANCELLATION_NOT_ALLOWED,
      });
    });

    it("cancelRestore() lanza RESTORE_NOT_FOUND si no existe", async () => {
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
      });
      const provider = new LocalBackupProvider(tempDir());
      const restoreManager = makeRestoreManager(backupManager, provider);
      await expect(restoreManager.cancelRestore("no-existe")).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_NOT_FOUND,
      });
    });
  });

  describe("consulta, historial y concurrencia", () => {
    it("getRestore()/listRestores()/filterRestores() reflejan el historial", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({ backupId: backup.backupId });

      expect(restoreManager.listRestores()).toEqual([result.restoreId]);
      expect(restoreManager.filterRestores({ backupId: backup.backupId })).toEqual([
        result.restoreId,
      ]);
      expect(restoreManager.getRestore("no-existe")).toBeUndefined();
    });

    it("loadFromPersistence() reconstruye el historial desde disco", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const historyDir = tempDir();
      const restoreManager1 = new RestoreManager({
        historyDir,
        backupManager,
        providers: [provider],
        configManager,
      });
      const result = await restoreManager1.restoreBackup({ backupId: backup.backupId });

      const restoreManager2 = new RestoreManager({
        historyDir,
        backupManager,
        providers: [provider],
        configManager,
      });
      const restored = await restoreManager2.loadFromPersistence();

      expect(restored).toEqual([result.restoreId]);
      expect(restoreManager2.getRestore(result.restoreId)?.state).toBe("completed");
    });

    it("rechaza una segunda restauración concurrente del mismo backup", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });

      const first = restoreManager.restoreBackup({ backupId: backup.backupId });
      await expect(
        restoreManager.restoreBackup({ backupId: backup.backupId })
      ).rejects.toMatchObject({
        code: RestoreErrorCode.RESTORE_OPERATION_CONFLICT,
      });
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
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, {
        configManager,
        eventBus: fakeBus as never,
      });

      await restoreManager.restoreBackup({ backupId: backup.backupId });

      expect(published).toEqual(
        [
          "requested",
          "preparing.started",
          "started",
          "progress.updated",
          "verification.started",
          "verification.completed",
          "completed",
        ].map((p) => `restore.${p}`)
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
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, {
        configManager,
        logger: fakeLogger as never,
      });

      await restoreManager.restoreBackup({ backupId: backup.backupId });

      expect(logs.some((m) => m.includes("restore:requested"))).toBe(true);
      expect(logs.some((m) => m.includes("restore:completed"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const { backupManager, provider, backup } = await makeBackupWithConfig(configManager);
      const restoreManager = makeRestoreManager(backupManager, provider, { configManager });
      const result = await restoreManager.restoreBackup({ backupId: backup.backupId });

      await core.registerModule(restoreManager);

      const section = await configManager.getSection<{ restores: string[] }>("restore-manager");
      expect(section?.restores).toEqual([result.restoreId]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
      });
      const restoreManager = makeRestoreManager(backupManager, new LocalBackupProvider(tempDir()));

      await core.registerModule(restoreManager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "restore-manager", status: "OK" }),
      ]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() no lanza (sin tareas programadas propias)", async () => {
      const backupManager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
      });
      const restoreManager = makeRestoreManager(backupManager, new LocalBackupProvider(tempDir()));
      await expect(restoreManager.dispose()).resolves.toBeUndefined();
    });
  });
});
