import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { PortableWorkspaceManager } from "../../src/PortableWorkspaceManager.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";

describe("PortableWorkspaceManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-pworkspace-core-"));
  }

  describe("localización y desplazamiento", () => {
    it("locateRoot() devuelve undefined si no hay ninguna raíz de DWM", async () => {
      const manager = new PortableWorkspaceManager({ startDir: tempDir() });
      expect(await manager.locateRoot()).toBeUndefined();
    });

    it("locateRoot() encuentra la raíz tras inicializar", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);
      expect(await manager.locateRoot()).toBe(path.resolve(root));
    });

    it("detectMove() detecta un cambio de unidad/carpeta", async () => {
      const oldRoot = tempDir();
      const newRoot = tempDir();
      const managerOld = new PortableWorkspaceManager({ startDir: oldRoot });
      const initResult = await managerOld.initializeWorkspace(oldRoot);

      // Simulamos que el usuario movió toda la carpeta DWM: ya no existe en oldRoot...
      const fs = await import("node:fs/promises");
      await fs.rm(path.join(oldRoot, ".dwm"), { recursive: true, force: true });
      // ...y ahora vive en newRoot, con la misma metadata (mismo id).
      const managerNew = new PortableWorkspaceManager({ startDir: newRoot });
      await managerNew.initializeWorkspace(newRoot);
      await managerNew.saveMetadata(newRoot, initResult.metadata);

      const result = await managerNew.detectMove(oldRoot, initResult.metadata.id);
      expect(result.moved).toBe(true);
      expect(result.newRoot).toBe(path.resolve(newRoot));
    });
  });

  describe("persistencia entre reinicios (locateOrRecoverActiveWorkspace)", () => {
    it("recupera el Workspace activo de la sesión anterior aunque startDir no tenga ninguna relación con su ubicación", async () => {
      const root = tempDir();
      const configDir = tempDir();
      const configManager = new ConfigManager({ configDir });

      // Sesión 1: se inicializa, se importa/activa y se registra el
      // Workspace (equivalente a workspace.register tras un import real).
      const session1 = new PortableWorkspaceManager({ startDir: root, configManager });
      await session1.initializeWorkspace(root);
      await session1.registerActiveWorkspace(root);

      // Sesión 2: instancia nueva (como al reabrir la app), con el mismo
      // ConfigManager (misma carpeta de datos en disco) pero un startDir
      // que no es ni ancestro ni descendiente de `root` — igual que
      // `workspaceStartDir = app.getPath("userData")` en la app real, que
      // no guarda ninguna relación de carpetas con el Workspace importado.
      const unrelatedStartDir = tempDir();
      const session2 = new PortableWorkspaceManager({
        startDir: unrelatedStartDir,
        configManager,
      });

      const recovered = await session2.locateOrRecoverActiveWorkspace();
      expect(recovered).toBe(path.resolve(root));
    });

    it("si el Workspace fue movido junto con DWM, lo localiza igualmente por su id de metadata", async () => {
      const configDir = tempDir();
      const configManager = new ConfigManager({ configDir });
      const oldRoot = tempDir();

      const session1 = new PortableWorkspaceManager({ startDir: oldRoot, configManager });
      await session1.initializeWorkspace(oldRoot);
      await session1.registerActiveWorkspace(oldRoot);
      const metadata = await session1.getMetadata(oldRoot);

      // Se mueve toda la carpeta DWM (aquí, simulado: el root anterior deja
      // de ser válido y aparece uno nuevo con la misma metadata, alcanzable
      // desde el nuevo startDir).
      const fs = await import("node:fs/promises");
      await fs.rm(path.join(oldRoot, ".dwm"), { recursive: true, force: true });
      const newRoot = tempDir();
      const session2 = new PortableWorkspaceManager({ startDir: newRoot, configManager });
      await session2.initializeWorkspace(newRoot);
      if (metadata) await session2.saveMetadata(newRoot, metadata);

      const recovered = await session2.locateOrRecoverActiveWorkspace();
      expect(recovered).toBe(path.resolve(newRoot));
    });

    it("sin ConfigManager, se comporta igual que locateRoot() (búsqueda ascendente pura)", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);

      expect(await manager.locateOrRecoverActiveWorkspace()).toBe(path.resolve(root));
    });

    it("sin ningún Workspace previamente registrado, cae de vuelta a la búsqueda ascendente desde startDir", async () => {
      const configDir = tempDir();
      const configManager = new ConfigManager({ configDir });
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root, configManager });
      await manager.initializeWorkspace(root);

      expect(await manager.locateOrRecoverActiveWorkspace()).toBe(path.resolve(root));
    });

    it("no confía ciegamente en la pista persistida: si el id de metadata no coincide, no la usa", async () => {
      const configDir = tempDir();
      const configManager = new ConfigManager({ configDir });
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root, configManager });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      // Se corrompe manualmente la pista persistida con un id que no existe.
      await configManager.setSection("portable-workspace", {
        activeId: "id-que-no-coincide",
        lastKnownRoot: root,
      });

      const otherManager = new PortableWorkspaceManager({
        startDir: tempDir(),
        configManager,
      });
      expect(await otherManager.locateOrRecoverActiveWorkspace()).toBeUndefined();
    });
  });

  describe("inicialización y validación", () => {
    it("initializeWorkspace() crea un Workspace nuevo si no existe ninguno", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      const result = await manager.initializeWorkspace(root);
      expect(result.alreadyInitialized).toBe(false);
      expect(result.createdDirectories).toHaveLength(17);
    });

    it("initializeWorkspace() sin argumento localiza o usa startDir como raíz nueva", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      const result = await manager.initializeWorkspace();
      expect(result.paths.root).toBe(root);
    });

    it("initializeWorkspace() reutiliza un Workspace existente sin modificar su metadata", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      const first = await manager.initializeWorkspace(root);
      const second = await manager.initializeWorkspace(root);
      expect(second.alreadyInitialized).toBe(true);
      expect(second.metadata).toEqual(first.metadata);
    });

    it("validateWorkspace()/assertValidWorkspace() reflejan el estado real del Workspace", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      expect((await manager.validateWorkspace(root)).valid).toBe(false);
      await expect(manager.assertValidWorkspace(root)).rejects.toMatchObject({
        code: WorkspaceErrorCode.PWORKSPACE_VALIDATION_FAILED,
      });

      await manager.initializeWorkspace(root);
      expect((await manager.validateWorkspace(root)).valid).toBe(true);
      await expect(manager.assertValidWorkspace(root)).resolves.toBeUndefined();
    });
  });

  describe("rutas y metadata", () => {
    it("getPaths() expone las rutas calculadas dinámicamente", () => {
      const manager = new PortableWorkspaceManager();
      const paths = manager.getPaths("/DWM");
      expect(paths.config).toBe(path.join("/DWM", "config"));
    });

    it("getMetadata()/saveMetadata() leen y persisten la metadata", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      const { metadata } = await manager.initializeWorkspace(root);

      const loaded = await manager.getMetadata(root);
      expect(loaded?.id).toBe(metadata.id);

      await new Promise((r) => setTimeout(r, 5));
      await manager.saveMetadata(root, metadata);
      const reloaded = await manager.getMetadata(root);
      expect(reloaded?.updatedAt).not.toBe(metadata.updatedAt);
    });

    it("getSuggestedPaths() sugiere ubicaciones de almacenamiento coherentes con la estructura", () => {
      const manager = new PortableWorkspaceManager();
      const suggested = manager.getSuggestedPaths("/DWM");
      expect(suggested.configDir).toBe(path.join("/DWM", "config"));
      expect(suggested.backupsCatalogDir.startsWith(path.join("/DWM", "backups"))).toBe(true);
    });
  });

  describe("registro del Workspace activo", () => {
    it("registerActiveWorkspace() registra y marca como activo un Workspace inicializado", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);

      const entry = await manager.registerActiveWorkspace(root);
      expect(entry.root).toBe(root);
      expect(manager.getActiveWorkspace()?.root).toBe(root);
    });

    it("registerActiveWorkspace() lanza PWORKSPACE_ROOT_NOT_LOCATED si no hay metadata", async () => {
      const manager = new PortableWorkspaceManager();
      await expect(manager.registerActiveWorkspace(tempDir())).rejects.toMatchObject({
        code: WorkspaceErrorCode.PWORKSPACE_ROOT_NOT_LOCATED,
      });
    });

    it("registerActiveWorkspace() es idempotente si ya estaba registrado", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);
      await expect(manager.registerActiveWorkspace(root)).resolves.toBeDefined();
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() refleja únicamente los gestores inyectados", async () => {
      const { WorkspaceManager } = await import("@dwm/workspace");
      const workspaceManager = new WorkspaceManager();
      const configManager = new ConfigManager({ configDir: tempDir() });

      const manager = new PortableWorkspaceManager({ workspaceManager, configManager });
      expect(manager.listConnectedIntegrations().sort()).toEqual(["config", "workspace"]);

      const bare = new PortableWorkspaceManager();
      expect(bare.listConnectedIntegrations()).toEqual([]);
    });
  });

  describe("estado (toStatusProvider)", () => {
    it("reporta UNKNOWN si no hay ningún Workspace activo", async () => {
      const manager = new PortableWorkspaceManager();
      const report = await manager.toStatusProvider().getStatus();
      expect(report.level).toBe("UNKNOWN");
    });

    it("reporta OK si el Workspace activo es válido", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      const report = await manager.toStatusProvider().getStatus();
      expect(report.level).toBe("OK");
    });

    it("reporta WARNING si el Workspace activo presenta problemas", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      const fs = await import("node:fs/promises");
      await fs.rm(path.join(root, "logs"), { recursive: true, force: true });

      const report = await manager.toStatusProvider().getStatus();
      expect(report.level).toBe("WARNING");
    });

    it("reporta ERROR si la comprobación de estado lanza inesperadamente", async () => {
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      const brokenValidator = { validate: () => Promise.reject(new Error("boom")) };
      (manager as unknown as { validator: unknown }).validator = brokenValidator;

      const report = await manager.toStatusProvider().getStatus();
      expect(report.level).toBe("ERROR");
    });
  });

  describe("eventos, logging e integraciones con el Core", () => {
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
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root, eventBus: fakeBus as never });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      expect(published).toEqual(["portable-workspace.initialized", "portable-workspace.activated"]);
    });

    it("registra el ciclo de vida a través de un Logger inyectado", async () => {
      const logs: string[] = [];
      const fakeLogger = {
        withCorrelationId: () => ({
          info: async (m: string) => void logs.push(m),
          error: async (m: string) => void logs.push(m),
        }),
      };
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root, logger: fakeLogger as never });
      await manager.initializeWorkspace(root);

      expect(logs.some((m) => m.includes("portable-workspace:initialized"))).toBe(true);
    });

    it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

      const configManager = new ConfigManager({ configDir: tempDir() });
      const root = tempDir();
      const manager = new PortableWorkspaceManager({ startDir: root, configManager });
      await manager.initializeWorkspace(root);
      await manager.registerActiveWorkspace(root);

      await core.registerModule(manager);

      const section = await configManager.getSection<{ activeId: string }>("portable-workspace");
      expect(section?.activeId).toBeDefined();

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const manager = new PortableWorkspaceManager({ startDir: tempDir() });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "portable-workspace-manager", status: "OK" }),
      ]);

      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });

    it("dispose() no lanza (sin tareas programadas propias)", async () => {
      const manager = new PortableWorkspaceManager();
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
