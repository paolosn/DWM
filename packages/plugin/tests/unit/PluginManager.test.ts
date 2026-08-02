import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { PluginManager } from "../../src/PluginManager.js";
import { PluginErrorCode } from "../../src/errors/PluginErrorCode.js";
import { PluginPermission } from "../../src/PluginPermissions.js";
import { StaticPluginSource } from "../../src/PluginSource.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeFactory, makeManifest } from "./support/FakePlugin.js";

describe("PluginManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-plugin-core-"));
  }
  function makeManager(overrides: Partial<ConstructorParameters<typeof PluginManager>[0]> = {}) {
    return new PluginManager({ pluginsDir: tempDir(), dwmVersion: "1.0.0", ...overrides });
  }

  it("rechaza opciones sin pluginsDir o dwmVersion válidos", () => {
    expect(() => new PluginManager({ pluginsDir: "", dwmVersion: "1.0.0" })).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION })
    );
    expect(() => new PluginManager({ pluginsDir: tempDir(), dwmVersion: "" })).toThrow(
      expect.objectContaining({ code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION })
    );
  });

  describe("descubrimiento, validación y registro", () => {
    it("discoverPlugins() registra manifiestos en estado 'discovered'", async () => {
      const manager = makeManager();
      const result = await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      expect(result.discovered).toEqual(["sample-plugin"]);
      expect(result.failed).toEqual([]);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("discovered");
    });

    it("discoverPlugins() tolera fallos parciales sin corromper el registro", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest({ id: "dup" })]));
      const result = await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ id: "dup" }), makeManifest({ id: "nuevo" })])
      );
      expect(result.discovered).toEqual(["nuevo"]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.error.code).toBe(PluginErrorCode.PLUGIN_ALREADY_REGISTERED);
      expect(manager.listPlugins().sort()).toEqual(["dup", "nuevo"]);
    });

    it("registerPlugin() transiciona a 'registered' validando el manifiesto", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      expect(manager.getPlugin("sample-plugin")?.state).toBe("registered");
    });

    it("registerPlugin() lanza PLUGIN_INVALID_MANIFEST si el manifiesto no es válido", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([{ ...makeManifest(), version: "no-semver" }])
      );
      await expect(manager.registerPlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_INVALID_MANIFEST,
      });
    });
  });

  describe("instalación", () => {
    it("installPlugin() ejecuta onInstall, persiste y transiciona a 'installed'", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      const { factory, plugin } = makeFactory();

      await manager.installPlugin("sample-plugin", factory);

      expect(plugin.installCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("installed");
    });

    it("installPlugin() rechaza una versión de DWM incompatible", async () => {
      const manager = makeManager({ dwmVersion: "1.0.0" });
      await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ minDwmVersion: "2.0.0" })])
      );
      await manager.registerPlugin("sample-plugin");
      const { factory } = makeFactory();

      await expect(manager.installPlugin("sample-plugin", factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_INCOMPATIBLE,
      });
    });

    it("installPlugin() rechaza si falta un módulo de DWM requerido", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ moduleDependencies: ["workspace"] })])
      );
      await manager.registerPlugin("sample-plugin");
      const { factory } = makeFactory();

      await expect(manager.installPlugin("sample-plugin", factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
      });
    });

    it("installPlugin() rechaza si falta una dependencia de otro plugin obligatoria", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({ dependencies: [{ pluginId: "otro", optional: false }] }),
        ])
      );
      await manager.registerPlugin("sample-plugin");
      const { factory } = makeFactory();

      await expect(manager.installPlugin("sample-plugin", factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
      });
    });

    it("installPlugin() rechaza por PLUGIN_VERSION_CONFLICT si la dependencia no alcanza minVersion", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ id: "base", version: "1.0.0" })])
      );
      await manager.registerPlugin("base");
      await manager.installPlugin("base", makeFactory().factory);

      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            id: "consumer",
            dependencies: [{ pluginId: "base", optional: false, minVersion: "2.0.0" }],
          }),
        ])
      );
      await manager.registerPlugin("consumer");

      await expect(manager.installPlugin("consumer", makeFactory().factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_VERSION_CONFLICT,
      });
    });

    it("installPlugin() no persiste ni instancia nada si onInstall falla (transaccional)", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      const { factory } = makeFactory({ failInstall: true });

      await expect(manager.installPlugin("sample-plugin", factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_INSTALL_FAILED,
      });
      expect(manager.getPlugin("sample-plugin")?.state).toBe("registered");
    });
  });

  describe("carga, inicialización y activación", () => {
    async function installedManager() {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      const { factory, plugin } = makeFactory();
      await manager.installPlugin("sample-plugin", factory);
      return { manager, plugin };
    }

    it("loadPlugin()/initializePlugin()/activatePlugin() progresan el estado e invocan los ganchos", async () => {
      const { manager, plugin } = await installedManager();
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");
      await manager.activatePlugin("sample-plugin");

      expect(plugin.loadCount).toBe(1);
      expect(plugin.initCount).toBe(1);
      expect(plugin.activateCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("active");
    });

    it("activatePlugin() rechaza un plugin no instalado (transición de estado inválida)", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");

      await expect(manager.activatePlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_LOAD_FAILED,
      });
    });

    it("activatePlugin() rechaza activación duplicada", async () => {
      const { manager } = await installedManager();
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");
      await manager.activatePlugin("sample-plugin");

      await expect(manager.activatePlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_INVALID_STATE_TRANSITION,
      });
    });

    it("activatePlugin() rechaza si una dependencia obligatoria no está activa", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest({ id: "base" })]));
      await manager.registerPlugin("base");
      await manager.installPlugin("base", makeFactory().factory);
      await manager.loadPlugin("base");
      await manager.initializePlugin("base");

      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({ id: "consumer", dependencies: [{ pluginId: "base", optional: false }] }),
        ])
      );
      await manager.registerPlugin("consumer");
      await manager.installPlugin("consumer", makeFactory().factory);
      await manager.loadPlugin("consumer");
      await manager.initializePlugin("consumer");

      await expect(manager.activatePlugin("consumer")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
      });
    });

    it("activatePlugin() rechaza con PLUGIN_PERMISSION_DENIED si un permiso obligatorio no fue concedido", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            permissions: [{ permission: PluginPermission.SECRETS_READ, required: true }],
          }),
        ])
      );
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");

      await expect(manager.activatePlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_PERMISSION_DENIED,
      });
    });

    it("activatePlugin() acepta si el permiso obligatorio sí fue concedido", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            permissions: [{ permission: PluginPermission.SECRETS_READ, required: true }],
          }),
        ])
      );
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory, {
        grantedPermissions: [PluginPermission.SECRETS_READ],
      });
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");

      await expect(manager.activatePlugin("sample-plugin")).resolves.toBeUndefined();
    });
  });

  describe("desactivación, descarga y desinstalación", () => {
    async function activeManager() {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      const { factory, plugin } = makeFactory();
      await manager.installPlugin("sample-plugin", factory);
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");
      await manager.activatePlugin("sample-plugin");
      return { manager, plugin };
    }

    it("deactivatePlugin() invoca onDeactivate y es idempotente si ya estaba inactivo", async () => {
      const { manager, plugin } = await activeManager();
      await manager.deactivatePlugin("sample-plugin");
      expect(plugin.deactivateCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("inactive");

      await expect(manager.deactivatePlugin("sample-plugin")).resolves.toBeUndefined();
      expect(plugin.deactivateCount).toBe(1);
    });

    it("deactivatePlugin() rechaza si hay dependientes activos, salvo cascade:true", async () => {
      const { manager } = await activeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            id: "consumer",
            dependencies: [{ pluginId: "sample-plugin", optional: false }],
          }),
        ])
      );
      await manager.registerPlugin("consumer");
      await manager.installPlugin("consumer", makeFactory().factory);
      await manager.loadPlugin("consumer");
      await manager.initializePlugin("consumer");
      await manager.activatePlugin("consumer");

      await expect(manager.deactivatePlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_HAS_ACTIVE_DEPENDENTS,
      });

      await expect(
        manager.deactivatePlugin("sample-plugin", { cascade: true })
      ).resolves.toBeUndefined();
      expect(manager.getPlugin("consumer")?.state).toBe("inactive");
      expect(manager.getPlugin("sample-plugin")?.state).toBe("inactive");
    });

    it("unloadPlugin() invoca onUnload y vuelve a 'installed'", async () => {
      const { manager, plugin } = await activeManager();
      await manager.deactivatePlugin("sample-plugin");
      await manager.unloadPlugin("sample-plugin");
      expect(plugin.unloadCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("installed");
    });

    it("uninstallPlugin() rechaza si hay dependientes activos", async () => {
      const { manager } = await activeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            id: "consumer",
            dependencies: [{ pluginId: "sample-plugin", optional: false }],
          }),
        ])
      );
      await manager.registerPlugin("consumer");
      await manager.installPlugin("consumer", makeFactory().factory);
      await manager.loadPlugin("consumer");
      await manager.initializePlugin("consumer");
      await manager.activatePlugin("consumer");

      await expect(manager.uninstallPlugin("sample-plugin")).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_HAS_ACTIVE_DEPENDENTS,
      });
    });

    it("uninstallPlugin() desactiva si estaba activo, invoca onUninstall y elimina del registro", async () => {
      const { manager, plugin } = await activeManager();
      await manager.uninstallPlugin("sample-plugin");
      expect(plugin.deactivateCount).toBe(1);
      expect(plugin.uninstallCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")).toBeUndefined();
    });

    it("uninstallPlugin() con keepConfiguration:true conserva el fichero persistido", async () => {
      const dir = tempDir();
      const manager = new PluginManager({ pluginsDir: dir, dwmVersion: "1.0.0" });
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);

      await manager.uninstallPlugin("sample-plugin", { keepConfiguration: true });

      const fs = await import("node:fs/promises");
      await expect(fs.access(`${dir}/sample-plugin.json`)).resolves.toBeUndefined();
    });
  });

  describe("recarga y actualización", () => {
    it("reloadPlugin() reconstruye la instancia y reactiva si estaba activa", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");
      await manager.activatePlugin("sample-plugin");

      const { factory: newFactory, plugin: newPlugin } = makeFactory();
      await manager.reloadPlugin("sample-plugin", newFactory);

      expect(newPlugin.loadCount).toBe(1);
      expect(newPlugin.initCount).toBe(1);
      expect(newPlugin.activateCount).toBe(1);
      expect(manager.getPlugin("sample-plugin")?.state).toBe("active");
    });

    it("updatePlugin() reemplaza el manifiesto y reactiva si estaba activa", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");
      await manager.activatePlugin("sample-plugin");

      const newManifest = makeManifest({ version: "2.0.0" });
      await manager.updatePlugin("sample-plugin", newManifest, makeFactory().factory);

      expect(manager.getPlugin("sample-plugin")?.manifest.version).toBe("2.0.0");
      expect(manager.getPlugin("sample-plugin")?.state).toBe("active");
    });

    it("updatePlugin() marca 'failed' y conserva el código específico del fallo (PLUGIN_INIT_FAILED)", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);
      await manager.loadPlugin("sample-plugin");
      await manager.initializePlugin("sample-plugin");

      const { factory: failingFactory } = makeFactory({ failInit: true });
      await expect(
        manager.updatePlugin("sample-plugin", makeManifest({ version: "2.0.0" }), failingFactory)
      ).rejects.toMatchObject({ code: PluginErrorCode.PLUGIN_INIT_FAILED });
      expect(manager.getPlugin("sample-plugin")?.state).toBe("failed");
    });

    it("updatePlugin() rechaza si la nueva versión de DWM es incompatible", async () => {
      const manager = makeManager({ dwmVersion: "1.0.0" });
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);

      await expect(
        manager.updatePlugin(
          "sample-plugin",
          makeManifest({ minDwmVersion: "5.0.0" }),
          makeFactory().factory
        )
      ).rejects.toMatchObject({ code: PluginErrorCode.PLUGIN_INCOMPATIBLE });
    });
  });

  describe("configuración", () => {
    it("updatePluginConfiguration()/resetPluginConfiguration() actualizan y restauran los ajustes", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ defaultConfiguration: { modo: "normal" } })])
      );
      await manager.registerPlugin("sample-plugin");

      await manager.updatePluginConfiguration("sample-plugin", { modo: "avanzado" });
      expect(manager.getPlugin("sample-plugin")?.configuration.settings).toEqual({
        modo: "avanzado",
      });

      await manager.resetPluginConfiguration("sample-plugin");
      expect(manager.getPlugin("sample-plugin")?.configuration.settings).toEqual({
        modo: "normal",
      });
    });
  });

  describe("consulta y salud", () => {
    it("getPlugin()/listPlugins()/searchPlugins()/hasPlugin() reflejan el registro", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest({ name: "Buscable" })]));
      expect(manager.hasPlugin("sample-plugin")).toBe(true);
      expect(manager.listPlugins()).toEqual(["sample-plugin"]);
      expect(manager.searchPlugins("buscable")).toEqual(["sample-plugin"]);
      expect(manager.getPlugin("no-existe")).toBeUndefined();
    });

    it("checkHealth() devuelve 'unavailable' si el plugin no está cargado", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      const health = await manager.checkHealth("sample-plugin");
      expect(health.status).toBe("unavailable");
    });

    it("checkHealth()/checkAllHealth() reflejan el resultado de checkHealth() del plugin", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory({ healthy: true }).factory);

      const health = await manager.checkHealth("sample-plugin");
      expect(health.status).toBe("healthy");

      const all = await manager.checkAllHealth();
      expect(all).toHaveLength(1);
    });

    it("checkHealth() devuelve 'failed' si checkHealth() del plugin lanza", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory({ failHealthCheck: true }).factory);

      const health = await manager.checkHealth("sample-plugin");
      expect(health.status).toBe("failed");
      expect(health.detail).toBeDefined();
    });
  });

  describe("persistencia y concurrencia", () => {
    it("loadFromPersistence() reconstruye el registro desde disco (activo pasa a inactivo)", async () => {
      const dir = tempDir();
      const manager1 = new PluginManager({ pluginsDir: dir, dwmVersion: "1.0.0" });
      await manager1.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager1.registerPlugin("sample-plugin");
      await manager1.installPlugin("sample-plugin", makeFactory().factory);
      await manager1.loadPlugin("sample-plugin");
      await manager1.initializePlugin("sample-plugin");
      await manager1.activatePlugin("sample-plugin");

      const manager2 = new PluginManager({ pluginsDir: dir, dwmVersion: "1.0.0" });
      const restored = await manager2.loadFromPersistence();
      expect(restored).toEqual(["sample-plugin"]);
      expect(manager2.getPlugin("sample-plugin")?.state).toBe("inactive");
    });

    it("rechaza una segunda operación concurrente sobre el mismo plugin con PLUGIN_OPERATION_IN_PROGRESS", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");

      const { factory } = makeFactory();
      const first = manager.installPlugin("sample-plugin", factory);
      await expect(manager.installPlugin("sample-plugin", factory)).rejects.toMatchObject({
        code: PluginErrorCode.PLUGIN_OPERATION_IN_PROGRESS,
      });
      await first;
    });

    it("permite operaciones simultáneas sobre plugins distintos", async () => {
      const manager = makeManager();
      await manager.discoverPlugins(
        new StaticPluginSource([makeManifest({ id: "a" }), makeManifest({ id: "b" })])
      );
      await manager.registerPlugin("a");
      await manager.registerPlugin("b");

      await Promise.all([
        manager.installPlugin("a", makeFactory().factory),
        manager.installPlugin("b", makeFactory().factory),
      ]);

      expect(manager.getPlugin("a")?.state).toBe("installed");
      expect(manager.getPlugin("b")?.state).toBe("installed");
    });
  });

  describe("permisos en el contexto", () => {
    it("solo expone servicios cuyos permisos fueron concedidos", async () => {
      const secretsManager = { getSecret: async (key: string) => `valor-de-${key}` };
      const fakeAiManager = { marker: "ai" };
      const manager = makeManager({
        secretsManager: secretsManager as never,
        aiManager: fakeAiManager as never,
      });
      await manager.discoverPlugins(
        new StaticPluginSource([
          makeManifest({
            permissions: [
              { permission: PluginPermission.SECRETS_READ, required: false },
              { permission: PluginPermission.AI_USE, required: false },
            ],
          }),
        ])
      );
      await manager.registerPlugin("sample-plugin");
      const { factory, plugin } = makeFactory();

      await manager.installPlugin("sample-plugin", factory, {
        grantedPermissions: [PluginPermission.SECRETS_READ],
      });

      expect(plugin.lastContext?.aiManager).toBeUndefined();
      await expect(plugin.lastContext?.getSecret("k")).resolves.toBe("valor-de-k");
    });

    it("getSecret() devuelve undefined sin el permiso concedido", async () => {
      const secretsManager = { getSecret: async () => "no-deberia-verse" };
      const manager = makeManager({ secretsManager: secretsManager as never });
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      const { factory, plugin } = makeFactory();

      await manager.installPlugin("sample-plugin", factory);

      await expect(plugin.lastContext?.getSecret("k")).resolves.toBeUndefined();
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
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));
      await manager.registerPlugin("sample-plugin");
      await manager.installPlugin("sample-plugin", makeFactory().factory);

      expect(published).toEqual(
        ["discovered", "registered", "install.started", "installed"].map((p) => `plugin.${p}`)
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
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));

      expect(logs.some((m) => m.includes("plugin:discovered"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ configManager });
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));

      await core.registerModule(manager);

      const section = await configManager.getSection<{ plugins: string[] }>("plugin-manager");
      expect(section?.plugins).toEqual(["sample-plugin"]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("programa el health check periódico a través de un Scheduler inyectado", async () => {
      const scheduler = new Scheduler();
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const manager = makeManager({ scheduler, healthCheckIntervalMs: 1000 });
      await manager.discoverPlugins(new StaticPluginSource([makeManifest()]));

      vi.useFakeTimers();
      try {
        await core.registerModule(manager);
        await vi.advanceTimersByTimeAsync(1000);
      } finally {
        vi.useRealTimers();
      }

      expect(manager.getPlugin("sample-plugin")?.health).toBeDefined();

      await core.shutdown();
      await scheduler.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() cancela el health check periódico", async () => {
      const scheduler = new Scheduler();
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const manager = makeManager({ scheduler, healthCheckIntervalMs: 1000 });
      await core.registerModule(manager);

      expect(scheduler.statistics().scheduledCount).toBe(1);
      await core.unregisterModule("plugin-manager");
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
        expect.objectContaining({ id: "plugin-manager", status: "OK" }),
      ]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
