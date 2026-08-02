import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { WorkspacePaths } from "@dwm/portable-workspace";
import { ImportManager } from "@dwm/import-manager";
import type { VerificationManager } from "@dwm/verification";
import { PSNAdapter } from "../../src/PSNAdapter.js";
import { PSNScanner } from "../../src/PSNScanner.js";
import { PSNErrorCode } from "../../src/errors/PSNErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeFullPSNTree } from "./support/fixtures.js";

describe("PSNAdapter", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-psn-core-"));
  }

  describe("scanWorkspace() con raíz explícita", () => {
    it("interpreta la raíz indicada y la deja como activa", async () => {
      const adapter = new PSNAdapter();
      const root = tempDir();
      await makeFullPSNTree(root);

      const model = await adapter.scanWorkspace(root);
      expect(model.root).toBe(root);
      expect(model.resources.length).toBeGreaterThan(0);
      expect(adapter.getActiveRoot()).toBe(root);
    });

    it("propaga el error original del escáner (p. ej. PSN_ROOT_NOT_FOUND) sin sobrescribir su código", async () => {
      const adapter = new PSNAdapter();
      await expect(adapter.scanWorkspace(`${tempDir()}/no-existe`)).rejects.toMatchObject({
        code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
      });
    });

    it("envuelve como PSN_SCAN_FAILED un fallo inesperado del escáner y notifica scan.failed", async () => {
      const failingScanner = {
        scan: async () => {
          throw new Error("fallo inesperado");
        },
      } as unknown as PSNScanner;
      const { EventBus } = await import("@dwm/event-bus");
      const eventBus = new EventBus();
      const failedEvents: string[] = [];
      eventBus.subscribe("psn.scan.failed", () => {
        failedEvents.push("failed");
      });

      const adapter = new PSNAdapter({ scanner: failingScanner, eventBus });
      await expect(adapter.scanWorkspace(tempDir())).rejects.toMatchObject({
        code: PSNErrorCode.PSN_SCAN_FAILED,
      });
      expect(failedEvents).toContain("failed");
    });
  });

  describe("resolución de la raíz por defecto", () => {
    it("usa WorkspacePaths.sistemaDeTrabajo si no hay ImportManager", async () => {
      const workspaceRoot = tempDir();
      const workspacePaths = new WorkspacePaths(workspaceRoot);
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(workspacePaths.sistemaDeTrabajo, { recursive: true });
      await makeFullPSNTree(workspacePaths.sistemaDeTrabajo);

      const adapter = new PSNAdapter({ workspacePaths });
      const model = await adapter.scanWorkspace();
      expect(model.root).toBe(workspacePaths.sistemaDeTrabajo);
    });

    it("usa el destino de la última importación dwm-workspace completada si hay ImportManager", async () => {
      const importManager = new ImportManager({ historyDir: tempDir() });
      const source = tempDir();
      await makeFullPSNTree(source);
      const destination = path.join(tempDir(), "importado");
      await importManager.importSource({
        sourceType: "dwm-workspace",
        sourcePath: source,
        destinationPath: destination,
      });

      const adapter = new PSNAdapter({ importManager });
      const model = await adapter.scanWorkspace();
      expect(model.root).toBe(destination);
    });

    it("prefiere el ImportManager sobre WorkspacePaths cuando ambos están disponibles", async () => {
      const importManager = new ImportManager({ historyDir: tempDir() });
      const source = tempDir();
      await makeFullPSNTree(source);
      const destination = path.join(tempDir(), "importado");
      await importManager.importSource({
        sourceType: "dwm-workspace",
        sourcePath: source,
        destinationPath: destination,
      });

      const workspacePaths = new WorkspacePaths(tempDir());
      const adapter = new PSNAdapter({ importManager, workspacePaths });
      const model = await adapter.scanWorkspace();
      expect(model.root).toBe(destination);
    });

    it("ignora importaciones que no son de tipo dwm-workspace", async () => {
      const importManager = new ImportManager({ historyDir: tempDir() });
      const source = tempDir();
      await makeFullPSNTree(source);
      await importManager.importSource({
        sourceType: "folder",
        sourcePath: source,
        destinationPath: path.join(tempDir(), "otra-carpeta"),
      });

      const workspacePaths = new WorkspacePaths(tempDir());
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(workspacePaths.sistemaDeTrabajo, { recursive: true });

      const adapter = new PSNAdapter({ importManager, workspacePaths });
      const model = await adapter.scanWorkspace();
      expect(model.root).toBe(workspacePaths.sistemaDeTrabajo);
    });

    it("lanza PSN_ROOT_UNRESOLVABLE si no hay raíz, ImportManager ni WorkspacePaths", async () => {
      const adapter = new PSNAdapter();
      await expect(adapter.scanWorkspace()).rejects.toMatchObject({
        code: PSNErrorCode.PSN_ROOT_UNRESOLVABLE,
      });
    });
  });

  describe("consulta del modelo", () => {
    it("getResource()/hasResource()/listResources() consultan la raíz activa por defecto", async () => {
      const adapter = new PSNAdapter();
      const root = tempDir();
      await makeFullPSNTree(root);
      await adapter.scanWorkspace(root);

      expect(adapter.hasResource("psn-base")).toBe(true);
      expect(adapter.hasResource("psn-panel")).toBe(true);
      expect(adapter.getResource("clientes")?.kind).toBe("clientes");
      expect(adapter.listResources().length).toBeGreaterThan(0);
    });

    it("getResourcePath() resuelve la ruta absoluta sin que el llamante conozca la estructura", async () => {
      const adapter = new PSNAdapter();
      const root = tempDir();
      await makeFullPSNTree(root);
      await adapter.scanWorkspace(root);

      expect(adapter.getResourcePath("agents")).toBe(path.join(root, ".kilo", "agents"));
      expect(adapter.getResourcePath("psn-base")).toBe(path.join(root, "PSN-BASE"));
    });

    it("getResourcePath() devuelve undefined si no hay raíz activa o el recurso no existe", () => {
      const adapter = new PSNAdapter();
      expect(adapter.getResourcePath("psn-base")).toBeUndefined();
    });

    it("getModel() devuelve undefined si no hay raíz activa ni modelo para la raíz indicada", async () => {
      const adapter = new PSNAdapter();
      expect(adapter.getModel()).toBeUndefined();
      const root = tempDir();
      await makeFullPSNTree(root);
      await adapter.scanWorkspace(root);
      expect(adapter.getModel("/otra-raiz-no-escaneada")).toBeUndefined();
      expect(adapter.getModel()?.root).toBe(root);
    });

    it("listScannedRoots()/setActiveRoot()/clear() gestionan múltiples raíces", async () => {
      const adapter = new PSNAdapter();
      const rootA = tempDir();
      const rootB = tempDir();
      await makeFullPSNTree(rootA);
      await makeFullPSNTree(rootB);
      await adapter.scanWorkspace(rootA);
      await adapter.scanWorkspace(rootB);

      expect(adapter.listScannedRoots().sort()).toEqual([rootA, rootB].sort());
      expect(adapter.getActiveRoot()).toBe(rootB);
      adapter.setActiveRoot(rootA);
      expect(adapter.getActiveRoot()).toBe(rootA);

      adapter.clear();
      expect(adapter.listScannedRoots()).toEqual([]);
      expect(adapter.getActiveRoot()).toBeUndefined();
    });

    it("getResource() lanza PSN_MODEL_NOT_FOUND si no se ha escaneado nada", () => {
      const adapter = new PSNAdapter();
      expect(() => adapter.getResource("psn-base")).toThrowError(
        expect.objectContaining({ code: PSNErrorCode.PSN_MODEL_NOT_FOUND })
      );
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() refleja las dependencias inyectadas", () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const importManager = new ImportManager({ historyDir: tempDir() });
      const adapter = new PSNAdapter({ configManager, workspacePaths, importManager });
      expect(adapter.listConnectedIntegrations()).toEqual(
        expect.arrayContaining(["config", "portable-workspace", "import-manager"])
      );
    });

    it("persiste su sección de configuración tras cada escaneo", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const adapter = new PSNAdapter({ configManager });
      const root = tempDir();
      await makeFullPSNTree(root);
      await adapter.scanWorkspace(root);

      const section = await configManager.getSection<{ roots: string[] }>("psn-adapter");
      expect(section?.roots).toEqual([root]);
    });

    it("registra un warning vía logger si la verificación posterior falla, sin fallar el escaneo", async () => {
      const { Logger, LogLevel } = await import("@dwm/logger");
      const logs: string[] = [];
      const logger = new Logger("psn-adapter-test", {
        minLevel: LogLevel.INFO,
        transports: [
          {
            write: async (entry) => {
              logs.push(entry.message);
            },
          },
        ],
      });
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;

      const adapter = new PSNAdapter({ logger, verificationManager: fakeVerificationManager });
      const root = tempDir();
      await makeFullPSNTree(root);
      const model = await adapter.scanWorkspace(root);

      expect(model.root).toBe(root);
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real", async () => {
      const { EventBus } = await import("@dwm/event-bus");
      const eventBus = new EventBus();
      const received: string[] = [];
      eventBus.subscribe("psn.scan.completed", () => {
        received.push("completed");
      });

      const adapter = new PSNAdapter({ eventBus });
      const root = tempDir();
      await makeFullPSNTree(root);
      await adapter.scanWorkspace(root);
      expect(received).toContain("completed");
    });

    it("toStatusProvider() informa UNKNOWN, WARNING y OK según el estado", async () => {
      const adapter = new PSNAdapter();
      const unknown = await adapter.toStatusProvider().getStatus();
      expect(unknown.level).toBe("UNKNOWN");

      const rootSinBase = tempDir();
      const { promises: fs } = await import("node:fs");
      await fs.mkdir(path.join(rootSinBase, "PROYECTOS"), { recursive: true });
      await adapter.scanWorkspace(rootSinBase);
      const warning = await adapter.toStatusProvider().getStatus();
      expect(warning.level).toBe("WARNING");

      const rootCompleto = tempDir();
      await makeFullPSNTree(rootCompleto);
      await adapter.scanWorkspace(rootCompleto);
      const ok = await adapter.toStatusProvider().getStatus();
      expect(ok.level).toBe("OK");
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const adapter = new PSNAdapter({ configManager });

      await core.registerModule(adapter);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "psn-adapter", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("psn-adapter");
      expect(section?.integrations).toContain("config");

      await adapter.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });

  it("acepta un PSNScanner inyectado en las opciones", async () => {
    const scanner = new PSNScanner();
    const adapter = new PSNAdapter({ scanner });
    const root = tempDir();
    await makeFullPSNTree(root);
    const model = await adapter.scanWorkspace(root);
    expect(model.root).toBe(root);
  });
});
