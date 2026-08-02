import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { BackupManager } from "../../src/BackupManager.js";
import { LocalBackupProvider } from "../../src/LocalBackupProvider.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeRequest } from "./support/fixtures.js";

function makeFakeProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "local",
    exists: async () => false,
    write: async () => {},
    read: async () => undefined,
    delete: async () => {},
    list: async () => [],
    getMetadata: async () => undefined,
    ...overrides,
  };
}

describe("BackupManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-backup-core-"));
  }
  function makeManager(overrides: Partial<ConstructorParameters<typeof BackupManager>[0]> = {}) {
    return new BackupManager({
      catalogDir: tempDir(),
      providers: [new LocalBackupProvider(tempDir())],
      ...overrides,
    });
  }

  it("rechaza opciones sin catalogDir o providers válidos", () => {
    expect(
      () => new BackupManager({ catalogDir: "", providers: [new LocalBackupProvider(tempDir())] })
    ).toThrow(expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_REQUEST }));
    expect(() => new BackupManager({ catalogDir: tempDir(), providers: [] })).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_REQUEST })
    );
  });

  describe("creación de backups", () => {
    it("createBackup() completo persiste, verifica y transiciona a 'completed'", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      expect(result.state).toBe("completed");
      expect(result.errors).toEqual([]);
      const descriptor = manager.getBackup(result.backupId);
      expect(descriptor?.manifest.checksum).toBeDefined();
      expect(descriptor?.manifest.sizeBytes).toBeGreaterThan(0);
      expect(descriptor?.manifest.itemCount).toBe(1);
    });

    it("createBackup() selectivo con varios recursos", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(
        makeRequest({
          type: "selective",
          resources: [
            { resourceType: "custom", resourceId: "r1" },
            { resourceType: "custom", resourceId: "r2" },
          ],
        })
      );
      expect(result.state).toBe("completed");
      expect(manager.getBackup(result.backupId)?.manifest.itemCount).toBe(2);
    });

    it("createBackup() incremental referencia el backup base y detecta cambios", async () => {
      const manager = makeManager();
      const base = await manager.createBackup(
        makeRequest({ resources: [{ resourceType: "custom", resourceId: "r1" }] })
      );

      const incremental = await manager.createBackup(
        makeRequest({
          type: "incremental",
          baseBackupId: base.backupId,
          resources: [
            { resourceType: "custom", resourceId: "r1" },
            { resourceType: "custom", resourceId: "r2" },
          ],
        })
      );

      expect(incremental.state).toBe("completed");
      const manifest = manager.getBackup(incremental.backupId)?.manifest;
      expect(manifest?.baseBackupId).toBe(base.backupId);
      expect(manifest?.changedResourceIds).toEqual(["custom:r2"]);
    });

    it("createBackup() incremental rechaza si el backup base no existe o no está completado", async () => {
      const manager = makeManager();
      await expect(
        manager.createBackup(makeRequest({ type: "incremental", baseBackupId: "no-existe" }))
      ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_BASE_MISSING });
    });

    it("createBackup() rechaza una solicitud inválida (validación previa)", async () => {
      const manager = makeManager();
      await expect(manager.createBackup(makeRequest({ resources: [] }))).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_INVALID_REQUEST,
      });
    });

    it("createBackup() falla si un recurso obligatorio no existe, y no queda registrado como completado", async () => {
      const projectManager = { getProject: () => undefined };
      const manager = makeManager({ projectManager: projectManager as never });
      await expect(
        manager.createBackup(
          makeRequest({ resources: [{ resourceType: "project", resourceId: "no-existe" }] })
        )
      ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_RESOURCE_NOT_FOUND });

      const id = manager.listBackups()[0] as string;
      expect(manager.getBackup(id)?.state).toBe("failed");
    });

    it("createBackup() con un recurso opcional ausente termina 'completed_with_warnings'", async () => {
      const projectManager = { getProject: () => undefined };
      const manager = makeManager({ projectManager: projectManager as never });
      const result = await manager.createBackup(
        makeRequest({
          resources: [
            { resourceType: "custom", resourceId: "r1" },
            { resourceType: "project", resourceId: "no-existe", required: false },
          ],
        })
      );
      expect(result.state).toBe("completed_with_warnings");
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("createBackup() rechaza un destino con path traversal", async () => {
      const manager = makeManager();
      await expect(
        manager.createBackup(makeRequest({ target: { providerId: "local", path: "../fuera" } }))
      ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_INVALID_REQUEST });
    });

    it("createBackup() rechaza un providerId desconocido", async () => {
      const manager = makeManager();
      await expect(
        manager.createBackup(makeRequest({ target: { providerId: "desconocido", path: "dest" } }))
      ).rejects.toMatchObject({ code: BackupErrorCode.BACKUP_INVALID_TARGET });
    });

    it("createBackup() respeta checkCapacity() del proveedor", async () => {
      const fakeProvider = makeFakeProvider({ checkCapacity: async () => false });
      const manager = new BackupManager({
        catalogDir: tempDir(),
        providers: [fakeProvider as never],
      });
      await expect(manager.createBackup(makeRequest())).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_INSUFFICIENT_SPACE,
      });
    });

    it("registra progreso durante la copia", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(
        makeRequest({
          resources: [
            { resourceType: "custom", resourceId: "r1" },
            { resourceType: "custom", resourceId: "r2" },
          ],
        })
      );
      const progress = manager.getBackup(result.backupId)?.progress;
      expect(progress?.itemsProcessed).toBe(2);
      expect(progress?.percentage).toBe(100);
    });
  });

  describe("cancelación", () => {
    it("cancelBackup() sobre un backup recién creado en 'pending' lo cancela de inmediato", async () => {
      const manager = makeManager();
      const promise = manager.createBackup(makeRequest());
      const id = manager.listBackups()[0] as string;
      expect(manager.getBackup(id)?.state).toBe("pending");

      await manager.cancelBackup(id);

      expect(manager.getBackup(id)?.state).toBe("cancelled");
      await promise.catch(() => {});
    });

    it("cancelBackup() cooperativo detiene una copia en curso antes de finalizar", async () => {
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const resolver = {
        resolve: async (resource: { resourceId: string }) => {
          if (resource.resourceId === "r1") await firstGate;
          return { resource, exists: true, snapshot: { ok: true } };
        },
      };
      const manager = new BackupManager({
        catalogDir: tempDir(),
        providers: [new LocalBackupProvider(tempDir())],
        sourceResolver: resolver as never,
      });

      const promise = manager.createBackup(
        makeRequest({
          resources: [
            { resourceType: "custom", resourceId: "r1" },
            { resourceType: "custom", resourceId: "r2" },
          ],
        })
      );
      await new Promise((r) => setTimeout(r, 10));
      const id = manager.listBackups()[0] as string;

      await manager.cancelBackup(id);
      releaseFirst();

      const result = await promise;
      expect(result.state).toBe("cancelled");
    });

    it("cancelBackup() es idempotente si ya está cancelado", async () => {
      const manager = makeManager();
      const promise = manager.createBackup(makeRequest());
      const id = manager.listBackups()[0] as string;
      await manager.cancelBackup(id);
      await expect(manager.cancelBackup(id)).resolves.toBeUndefined();
      await promise.catch(() => {});
    });

    it("cancelBackup() rechaza si el backup ya finalizó", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      await expect(manager.cancelBackup(result.backupId)).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_CANCELLATION_NOT_ALLOWED,
      });
    });

    it("cancelBackup() lanza BACKUP_NOT_FOUND si el backup no existe", async () => {
      const manager = makeManager();
      await expect(manager.cancelBackup("no-existe")).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_NOT_FOUND,
      });
    });
  });

  describe("consulta y catálogo", () => {
    it("getBackup()/listBackups()/filterBackups() reflejan el catálogo", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      expect(manager.listBackups()).toEqual([result.backupId]);
      expect(manager.filterBackups({ type: "full" })).toEqual([result.backupId]);
      expect(manager.getBackup("no-existe")).toBeUndefined();
    });

    it("setBackupPolicy() actualiza la política asociada", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      manager.setBackupPolicy(result.backupId, { protected: true, tags: ["critico"] });
      expect(manager.getBackup(result.backupId)?.policy.protected).toBe(true);
    });
  });

  describe("integridad", () => {
    it("verifyIntegrity() confirma un backup válido tras su creación", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      const integrity = await manager.verifyIntegrity(result.backupId);
      expect(integrity.status).toBe("valid");
    });

    it("verifyIntegrity() detecta manipulación externa del checksum", async () => {
      const catalogDir = tempDir();
      const storageDir = tempDir();
      const manager = new BackupManager({
        catalogDir,
        providers: [new LocalBackupProvider(storageDir)],
      });
      const result = await manager.createBackup(makeRequest());

      const fs = await import("node:fs/promises");
      await fs.writeFile(
        `${storageDir}/dest/${result.backupId}.json`,
        '{"manipulado":true}',
        "utf-8"
      );

      const integrity = await manager.verifyIntegrity(result.backupId);
      expect(integrity.status).toBe("invalid");
    });
  });

  describe("eliminación", () => {
    it("deleteBackup() elimina del catálogo y del proveedor", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      await manager.deleteBackup(result.backupId);
      expect(manager.getBackup(result.backupId)).toBeUndefined();
    });

    it("deleteBackup() rechaza eliminar un backup base requerido por un incremental", async () => {
      const manager = makeManager();
      const base = await manager.createBackup(makeRequest());
      await manager.createBackup(makeRequest({ type: "incremental", baseBackupId: base.backupId }));

      await expect(manager.deleteBackup(base.backupId)).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_DELETE_BLOCKED,
      });
      await expect(manager.deleteBackup(base.backupId, { force: true })).resolves.toBeUndefined();
    });

    it("deleteBackup() lanza BACKUP_NOT_FOUND si el backup no existe", async () => {
      const manager = makeManager();
      await expect(manager.deleteBackup("no-existe")).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_NOT_FOUND,
      });
    });
  });

  describe("retención", () => {
    async function threeCompletedBackups(manager: BackupManager) {
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const result = await manager.createBackup(
          makeRequest({ resources: [{ resourceType: "custom", resourceId: `r${i}` }] })
        );
        ids.push(result.backupId);
        // Garantiza createdAt estrictamente crecientes entre backups: sin este margen,
        // la resolución de milisegundo de createdAt puede empatar y el desempate por
        // id (ajeno al orden de creación) vuelve no determinista el resultado.
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      return ids;
    }

    it("aplica retención por cantidad (keepLast)", async () => {
      const manager = makeManager();
      const ids = await threeCompletedBackups(manager);

      const result = await manager.applyRetentionPolicy({ id: "p1", keepLast: 1 });

      expect(result.kept).toEqual([ids[ids.length - 1]]);
      expect(manager.listBackups()).toEqual([ids[ids.length - 1]]);
    });

    it("aplica retención por antigüedad (keepForDays): elimina backups anteriores al corte", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());

      const retention = await manager.applyRetentionPolicy({ id: "p2", keepForDays: 0 });

      expect(retention.toDelete).toEqual([result.backupId]);
      expect(manager.getBackup(result.backupId)).toBeUndefined();
    });

    it("no elimina backups protegidos", async () => {
      const manager = makeManager();
      const result = await manager.createBackup(makeRequest());
      manager.setBackupPolicy(result.backupId, { protected: true, tags: [] });

      const retention = await manager.applyRetentionPolicy({ id: "p3", keepLast: 0 });

      expect(retention.toDelete).toEqual([]);
      expect(manager.getBackup(result.backupId)).toBeDefined();
    });

    it("dryRun simula sin eliminar nada", async () => {
      const manager = makeManager();
      const ids = await threeCompletedBackups(manager);

      const result = await manager.applyRetentionPolicy(
        { id: "p4", keepLast: 1 },
        { dryRun: true }
      );

      expect(result.toDelete.length).toBe(2);
      expect(manager.listBackups().sort()).toEqual([...ids].sort());
    });

    it("no elimina un backup base cuyo incremental se mantiene", async () => {
      const manager = makeManager();
      const base = await manager.createBackup(makeRequest());
      await manager.createBackup(makeRequest({ type: "incremental", baseBackupId: base.backupId }));

      const result = await manager.applyRetentionPolicy({ id: "p5", keepLast: 1 });

      expect(manager.getBackup(base.backupId)).toBeDefined();
      expect(result.kept).toContain(base.backupId);
    });
  });

  describe("programación", () => {
    it("scheduleBackup()/unscheduleBackup() usan el Scheduler inyectado sin duplicar tareas", async () => {
      const scheduler = new Scheduler();
      const manager = makeManager({ scheduler });

      manager.scheduleBackup("diario", makeRequest(), 1000);
      expect(() => manager.scheduleBackup("diario", makeRequest(), 1000)).toThrow(
        expect.objectContaining({ code: BackupErrorCode.BACKUP_OPERATION_CONFLICT })
      );

      manager.unscheduleBackup("diario");
      expect(() => manager.unscheduleBackup("diario")).toThrow(
        expect.objectContaining({ code: BackupErrorCode.BACKUP_NOT_FOUND })
      );

      await scheduler.shutdown();
    });

    it("scheduleBackup() lanza si no hay Scheduler integrado", () => {
      const manager = makeManager();
      expect(() => manager.scheduleBackup("diario", makeRequest(), 1000)).toThrow(
        expect.objectContaining({ code: BackupErrorCode.BACKUP_OPERATION_CONFLICT })
      );
    });

    it("la eliminación de una programación no borra backups ya creados", async () => {
      const scheduler = new Scheduler();
      const manager = makeManager({ scheduler });
      const result = await manager.createBackup(makeRequest());

      manager.scheduleBackup("diario", makeRequest(), 1000);
      manager.unscheduleBackup("diario");

      expect(manager.getBackup(result.backupId)).toBeDefined();
      await scheduler.shutdown();
    });
  });

  describe("persistencia y concurrencia", () => {
    it("loadFromPersistence() reconstruye el catálogo desde disco", async () => {
      const catalogDir = tempDir();
      const storageDir = tempDir();
      const manager1 = new BackupManager({
        catalogDir,
        providers: [new LocalBackupProvider(storageDir)],
      });
      const result = await manager1.createBackup(makeRequest());

      const manager2 = new BackupManager({
        catalogDir,
        providers: [new LocalBackupProvider(storageDir)],
      });
      const restored = await manager2.loadFromPersistence();

      expect(restored).toEqual([result.backupId]);
      expect(manager2.getBackup(result.backupId)?.state).toBe("completed");
    });

    it("rechaza una segunda creación concurrente sobre el mismo destino", async () => {
      const manager = makeManager();
      const first = manager.createBackup(makeRequest());
      await expect(manager.createBackup(makeRequest())).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
      });
      await first;
    });

    it("permite creaciones simultáneas sobre destinos distintos", async () => {
      const provider = new LocalBackupProvider(tempDir());
      const manager = new BackupManager({ catalogDir: tempDir(), providers: [provider] });

      const [a, b] = await Promise.all([
        manager.createBackup(makeRequest({ target: { providerId: "local", path: "dest-a" } })),
        manager.createBackup(makeRequest({ target: { providerId: "local", path: "dest-b" } })),
      ]);

      expect(a.state).toBe("completed");
      expect(b.state).toBe("completed");
    });

    it("libera el bloqueo tras un error, permitiendo reintentar sobre el mismo destino", async () => {
      const manager = makeManager();
      await expect(manager.createBackup(makeRequest({ resources: [] }))).rejects.toMatchObject({
        code: BackupErrorCode.BACKUP_INVALID_REQUEST,
      });
      const result = await manager.createBackup(makeRequest());
      expect(result.state).toBe("completed");
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
      const result = await manager.createBackup(makeRequest());
      await manager.deleteBackup(result.backupId);

      expect(published).toEqual(
        [
          "requested",
          "preparing.started",
          "started",
          "progress.updated",
          "verification.started",
          "verification.completed",
          "completed",
          "delete.started",
          "deleted",
        ].map((p) => `backup.${p}`)
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
      await manager.createBackup(makeRequest());

      expect(logs.some((m) => m.includes("backup:requested"))).toBe(true);
      expect(logs.some((m) => m.includes("backup:completed"))).toBe(true);
    });

    it("nunca registra el valor de un secreto en los logs", async () => {
      const logs: string[] = [];
      const fakeLogger = {
        withCorrelationId: () => ({
          info: async (m: string) => void logs.push(m),
          error: async (m: string) => void logs.push(m),
        }),
      };
      const secretsManager = {
        hasSecret: async () => true,
        getSecret: async () => "valor-secreto-ultra-confidencial",
      };
      const manager = makeManager({
        logger: fakeLogger as never,
        secretsManager: secretsManager as never,
      });
      await manager.createBackup(
        makeRequest({ resources: [{ resourceType: "secret-ref", resourceId: "api-key" }] })
      );

      expect(logs.some((m) => m.includes("valor-secreto-ultra-confidencial"))).toBe(false);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ configManager });
      const result = await manager.createBackup(makeRequest());

      await core.registerModule(manager);

      const section = await configManager.getSection<{ backups: string[] }>("backup-manager");
      expect(section?.backups).toEqual([result.backupId]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("programa la revisión periódica de retención a través de un Scheduler inyectado", async () => {
      const scheduler = new Scheduler();
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const manager = makeManager({
        scheduler,
        retentionCheckIntervalMs: 1000,
        defaultRetentionPolicy: { id: "auto", keepLast: 5 },
      });
      await manager.createBackup(makeRequest());

      vi.useFakeTimers();
      try {
        await core.registerModule(manager);
        await vi.advanceTimersByTimeAsync(1000);
      } finally {
        vi.useRealTimers();
      }

      await core.shutdown();
      await scheduler.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() cancela la revisión de retención y todas las programaciones activas", async () => {
      const scheduler = new Scheduler();
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const manager = makeManager({
        scheduler,
        retentionCheckIntervalMs: 1000,
        defaultRetentionPolicy: { id: "auto", keepLast: 5 },
      });
      manager.scheduleBackup("diario", makeRequest(), 2000);
      await core.registerModule(manager);

      expect(scheduler.statistics().scheduledCount).toBe(2);
      await core.unregisterModule("backup-manager");
      expect(scheduler.statistics().scheduledCount).toBe(0);

      await core.shutdown();
      await scheduler.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const manager = makeManager();

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "backup-manager", status: "OK" }),
      ]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
