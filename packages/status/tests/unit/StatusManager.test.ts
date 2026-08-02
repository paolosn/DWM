import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { StatusManager } from "../../src/StatusManager.js";
import { StatusErrorCode } from "../../src/errors/StatusErrorCode.js";
import { makeStatusReport } from "../../src/StatusTypes.js";
import { makeTempDir } from "./support/tempDir.js";

describe("StatusManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-status-core-"));
  }
  function makeManager(overrides: Record<string, unknown> = {}) {
    return new StatusManager({ historyDir: tempDir(), ...overrides });
  }

  it("rechaza opciones sin historyDir válido", () => {
    expect(() => new StatusManager({ historyDir: "" })).toThrow(
      expect.objectContaining({ code: StatusErrorCode.STATUS_INVALID_REQUEST })
    );
  });

  it("registra los doce proveedores integrados desde el constructor", () => {
    const manager = makeManager();
    expect(manager.listProviders()).toEqual([
      "ai-manager",
      "backup",
      "config",
      "core",
      "migration",
      "plugin",
      "profile",
      "project",
      "restore",
      "secrets",
      "verification",
      "workspace",
    ]);
  });

  describe("estado global y por módulo", () => {
    it("getGlobalStatus() agrega el peor nivel entre todos los proveedores (sin integraciones, todo UNKNOWN)", async () => {
      const manager = makeManager();
      const snapshot = await manager.getGlobalStatus();
      expect(snapshot.level).toBe("UNKNOWN");
      expect(snapshot.reports).toHaveLength(12);
      expect(snapshot.reports.every((r) => r.level === "UNKNOWN")).toBe(true);
    });

    it("getModuleStatus() consulta un proveedor concreto", async () => {
      const manager = makeManager();
      const report = await manager.getModuleStatus("core");
      expect(report.providerId).toBe("core");
      expect(report.level).toBe("UNKNOWN");
    });

    it("getModuleStatus() lanza STATUS_PROVIDER_NOT_FOUND para un id desconocido", async () => {
      const manager = makeManager();
      await expect(manager.getModuleStatus("no-existe")).rejects.toMatchObject({
        code: StatusErrorCode.STATUS_PROVIDER_NOT_FOUND,
      });
    });

    it("getModuleStatus() envuelve un fallo del proveedor como STATUS_PROVIDER_QUERY_FAILED", async () => {
      const manager = makeManager();
      manager.registerProvider({
        id: "roto",
        getStatus: () => {
          throw new Error("boom");
        },
      });
      await expect(manager.getModuleStatus("roto")).rejects.toMatchObject({
        code: StatusErrorCode.STATUS_PROVIDER_QUERY_FAILED,
      });
    });

    it("getGlobalStatus() nunca lanza por un proveedor individual que falle; lo refleja como ERROR", async () => {
      const manager = makeManager();
      manager.registerProvider({
        id: "roto",
        getStatus: () => {
          throw new Error("boom");
        },
      });
      const snapshot = await manager.getGlobalStatus();
      expect(snapshot.level).toBe("ERROR");
      expect(snapshot.reports.find((r) => r.providerId === "roto")?.level).toBe("ERROR");
    });
  });

  describe("accesos directos por módulo", () => {
    it("cada acceso directo delega en getModuleStatus() con el id fijo correspondiente", async () => {
      const manager = makeManager();
      const pairs: Array<[() => Promise<{ providerId: string }>, string]> = [
        [() => manager.getCoreStatus(), "core"],
        [() => manager.getWorkspaceStatus(), "workspace"],
        [() => manager.getConfigStatus(), "config"],
        [() => manager.getSecretsStatus(), "secrets"],
        [() => manager.getAIStatus(), "ai-manager"],
        [() => manager.getProfileStatus(), "profile"],
        [() => manager.getProjectsStatus(), "project"],
        [() => manager.getPluginsStatus(), "plugin"],
        [() => manager.getBackupsStatus(), "backup"],
        [() => manager.getRestoresStatus(), "restore"],
        [() => manager.getMigrationsStatus(), "migration"],
        [() => manager.getVerificationStatus(), "verification"],
      ];
      for (const [fn, expectedId] of pairs) {
        expect((await fn()).providerId).toBe(expectedId);
      }
    });
  });

  describe("extensibilidad", () => {
    it("registerProvider()/unregisterProvider() permiten añadir proveedores futuros sin tocar el código existente", async () => {
      const manager = makeManager();
      manager.registerProvider({
        id: "custom",
        getStatus: () => makeStatusReport("custom", "OK", "todo bien"),
      });
      expect(manager.listProviders()).toContain("custom");
      expect((await manager.getModuleStatus("custom")).level).toBe("OK");

      manager.unregisterProvider("custom");
      expect(manager.listProviders()).not.toContain("custom");
    });

    it("rechaza registrar dos proveedores con el mismo id", () => {
      const manager = makeManager();
      expect(() =>
        manager.registerProvider({
          id: "core",
          getStatus: () => makeStatusReport("core", "OK", "x"),
        })
      ).toThrow(
        expect.objectContaining({ code: StatusErrorCode.STATUS_PROVIDER_ALREADY_REGISTERED })
      );
    });
  });

  describe("instantáneas persistidas", () => {
    it("getGlobalStatus() persiste una instantánea recuperable", async () => {
      const manager = makeManager();
      const snapshot = await manager.getGlobalStatus();

      expect(await manager.listSnapshots()).toEqual([snapshot.snapshotId]);
      expect(await manager.getSnapshot(snapshot.snapshotId)).toEqual(snapshot);
    });

    it("getSnapshot() devuelve undefined si no existe; requireSnapshot() lanza STATUS_SNAPSHOT_NOT_FOUND", async () => {
      const manager = makeManager();
      expect(await manager.getSnapshot("no-existe")).toBeUndefined();
      await expect(manager.requireSnapshot("no-existe")).rejects.toMatchObject({
        code: StatusErrorCode.STATUS_SNAPSHOT_NOT_FOUND,
      });
    });

    it("requireSnapshot() devuelve la instantánea si existe", async () => {
      const manager = makeManager();
      const snapshot = await manager.getGlobalStatus();
      await expect(manager.requireSnapshot(snapshot.snapshotId)).resolves.toEqual(snapshot);
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
      await manager.getGlobalStatus();

      expect(published).toEqual(
        ["snapshot.requested", "snapshot.created"].map((p) => `status.${p}`)
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
      await manager.getGlobalStatus();

      expect(logs.some((m) => m.includes("status:snapshot.requested"))).toBe(true);
      expect(logs.some((m) => m.includes("status:snapshot.created"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ configManager });

      await core.registerModule(manager);

      const section = await configManager.getSection<{ providers: string[] }>("status-manager");
      expect(section?.providers).toHaveLength(12);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real, y su propio estado se refleja como 'core'", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const manager = makeManager({ core });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "status-manager", status: "OK" }),
      ]);

      const report = await manager.getCoreStatus();
      expect(report.level).toBe("OK");

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() no lanza (sin tareas programadas propias)", async () => {
      const manager = makeManager();
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
