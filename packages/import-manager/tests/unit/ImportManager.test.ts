import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { WorkspacePaths } from "@dwm/portable-workspace";
import type { VerificationManager } from "@dwm/verification";
import { ImportManager } from "../../src/ImportManager.js";
import { ImportScanner } from "../../src/ImportScanner.js";
import { ImportErrorCode } from "../../src/errors/ImportErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import { makeSampleSourceTree } from "./support/fixtures.js";

class FlakyScanner extends ImportScanner {
  private calls = 0;
  override async scanFolder(rootPath: string, excludePatterns: readonly string[] = []) {
    const result = await super.scanFolder(rootPath, excludePatterns);
    this.calls += 1;
    if (this.calls === 2) {
      return { ...result, fileCount: result.fileCount + 1 };
    }
    return result;
  }
}

describe("ImportManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-import-core-"));
  }

  it("rechaza opciones sin historyDir válido", () => {
    expect(() => new ImportManager({ historyDir: "" })).toThrow(
      expect.objectContaining({ code: ImportErrorCode.IMPORT_INVALID_REQUEST })
    );
  });

  it("importSource() rechaza una solicitud inválida", async () => {
    const manager = new ImportManager({ historyDir: tempDir() });
    await expect(
      manager.importSource({ sourceType: "x" as never, sourcePath: "" })
    ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_INVALID_REQUEST });
  });

  describe("resolución de destino", () => {
    it("usa destinationPath explícito si se indica", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-explicito");

      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
      });

      expect(result.destinationPath).toBe(destination);
      expect(result.state).toBe("completed");
      const copied = await fs.stat(path.join(destination, "readme.md"));
      expect(copied.isFile()).toBe(true);
    });

    it("resuelve dwm-workspace a sistemaDeTrabajo cuando hay WorkspacePaths", async () => {
      const workspaceRoot = tempDir();
      const workspacePaths = new WorkspacePaths(workspaceRoot);
      const manager = new ImportManager({ historyDir: tempDir(), workspacePaths });
      const root = tempDir();
      await makeSampleSourceTree(root);

      const result = await manager.importSource({ sourceType: "dwm-workspace", sourcePath: root });
      expect(result.destinationPath).toBe(workspacePaths.sistemaDeTrabajo);
    });

    it("resuelve folder/zip al basename bajo workspace/ cuando hay WorkspacePaths", async () => {
      const workspaceRoot = tempDir();
      const workspacePaths = new WorkspacePaths(workspaceRoot);
      const manager = new ImportManager({ historyDir: tempDir(), workspacePaths });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const sourceDir = path.join(tempDir(), "mi-proyecto");
      await fs.rename(root, sourceDir);

      const result = await manager.importSource({ sourceType: "folder", sourcePath: sourceDir });
      expect(result.destinationPath).toBe(path.join(workspacePaths.workspace, "mi-proyecto"));
    });

    it("une destinationRelativePath a la raíz del WorkspacePaths", async () => {
      const workspaceRoot = tempDir();
      const workspacePaths = new WorkspacePaths(workspaceRoot);
      const manager = new ImportManager({ historyDir: tempDir(), workspacePaths });
      const root = tempDir();
      await makeSampleSourceTree(root);

      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationRelativePath: "workspace/personalizado",
      });
      expect(result.destinationPath).toBe(path.join(workspaceRoot, "workspace/personalizado"));
    });

    it("lanza IMPORT_DESTINATION_UNRESOLVABLE si falta destino y WorkspacePaths", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      await expect(
        manager.importSource({ sourceType: "folder", sourcePath: tempDir() })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_DESTINATION_UNRESOLVABLE });
    });

    it("lanza IMPORT_DESTINATION_UNRESOLVABLE si destinationRelativePath se indica sin WorkspacePaths", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: tempDir(),
          destinationRelativePath: "a/b",
        })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_DESTINATION_UNRESOLVABLE });
    });
  });

  describe("copia, sobrescritura y dry-run", () => {
    it("falla si el destino ya existe y no se indica overwriteExisting", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = tempDir();

      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: root,
          destinationPath: destination,
        })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_DESTINATION_EXISTS });

      const record = manager.listImports()[0];
      expect(manager.getImport(record!)?.state).toBe("failed");
    });

    it("sustituye el destino cuando overwriteExisting es true", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = tempDir();
      await fs.writeFile(path.join(destination, "viejo.txt"), "viejo");

      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
        overwriteExisting: true,
      });

      expect(result.state).toBe("completed");
      await expect(fs.stat(path.join(destination, "viejo.txt"))).rejects.toBeDefined();
      const copied = await fs.stat(path.join(destination, "readme.md"));
      expect(copied.isFile()).toBe(true);
    });

    it("importación repetida del mismo origen: falla la segunda vez sin overwriteExisting, y sustituye correctamente con overwriteExisting", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-repetido");

      const first = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
      });
      expect(first.state).toBe("completed");

      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: root,
          destinationPath: destination,
        })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_DESTINATION_EXISTS });

      // Añade un fichero nuevo al origen entre ambas importaciones, para
      // comprobar que la segunda pasada (con overwriteExisting) refleja
      // de verdad el estado actual del origen, no una copia obsoleta.
      await fs.writeFile(path.join(root, "nuevo-tras-primera-importacion.txt"), "v2", "utf-8");

      const second = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
        overwriteExisting: true,
      });
      expect(second.state).toBe("completed");
      const refreshedFile = await fs.readFile(
        path.join(destination, "nuevo-tras-primera-importacion.txt"),
        "utf-8"
      );
      expect(refreshedFile).toBe("v2");
    });

    it("dryRun escanea y valida sin escribir en el destino", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-dry");

      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
        dryRun: true,
      });

      expect(result.state).toBe("completed");
      expect(result.dryRun).toBe(true);
      expect(result.filesImported).toBeGreaterThan(0);
      await expect(fs.stat(destination)).rejects.toBeDefined();
    });

    it("falla y no deja destino parcial si el origen desaparece durante el escaneo", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const missingSource = path.join(tempDir(), "no-existe");
      const destination = path.join(tempDir(), "destino-fallido");

      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: missingSource,
          destinationPath: destination,
        })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND });

      await expect(fs.stat(destination)).rejects.toBeDefined();
      const id = manager.listImports()[0]!;
      expect(manager.getImport(id)?.state).toBe("failed");
      expect(manager.getImport(id)?.errors.length).toBeGreaterThan(0);
    });

    it("revierte y falla con IMPORT_INTEGRITY_MISMATCH si la copia no coincide con el origen", async () => {
      const scanner = new FlakyScanner();
      const manager = new ImportManager({ historyDir: tempDir(), scanner });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-integridad");

      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: root,
          destinationPath: destination,
        })
      ).rejects.toMatchObject({ code: ImportErrorCode.IMPORT_INTEGRITY_MISMATCH });

      await expect(fs.stat(destination)).rejects.toBeDefined();
    });

    it("rechaza una segunda importación concurrente al mismo destino", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-concurrente");
      const request = {
        sourceType: "folder" as const,
        sourcePath: root,
        destinationPath: destination,
      };

      const first = manager.importSource(request);
      await expect(manager.importSource(request)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_OPERATION_CONFLICT,
      });
      await first;
    });
  });

  describe("cancelación", () => {
    it("cancelImport() lanza IMPORT_NOT_FOUND para un id desconocido", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      await expect(manager.cancelImport("no-existe")).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_NOT_FOUND,
      });
    });

    it("cancelImport() lanza IMPORT_CANCELLATION_NOT_ALLOWED sobre una importación terminada", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const destination = path.join(tempDir(), "destino-cancelado");
      await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: destination,
      });

      const id = manager.listImports()[0]!;
      await expect(manager.cancelImport(id)).rejects.toMatchObject({
        code: ImportErrorCode.IMPORT_CANCELLATION_NOT_ALLOWED,
      });
    });
  });

  describe("consulta, historial y persistencia", () => {
    it("getImport() devuelve undefined para un id inexistente", () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      expect(manager.getImport("no-existe")).toBeUndefined();
    });

    it("filterImports() filtra por sourceType", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: path.join(tempDir(), "d1"),
      });
      expect(manager.filterImports({ sourceType: "folder" }).length).toBe(1);
      expect(manager.filterImports({ sourceType: "zip" }).length).toBe(0);
    });

    it("scanSource() valida y delega en el ImportScanner", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const scan = await manager.scanSource({ sourceType: "folder", sourcePath: root });
      expect(scan.fileCount).toBeGreaterThan(0);
    });

    it("loadFromPersistence() recupera importaciones persistidas y evita duplicados", async () => {
      const historyDir = tempDir();
      const manager = new ImportManager({ historyDir });
      const root = tempDir();
      await makeSampleSourceTree(root);
      await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: path.join(tempDir(), "d-persist"),
      });

      const other = new ImportManager({ historyDir });
      const restored = await other.loadFromPersistence();
      expect(restored).toHaveLength(1);
      expect(other.getImport(restored[0]!)?.state).toBe("completed");

      const again = await other.loadFromPersistence();
      expect(again).toHaveLength(0);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() refleja las dependencias inyectadas", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const workspacePaths = new WorkspacePaths(tempDir());
      const manager = new ImportManager({
        historyDir: tempDir(),
        configManager,
        workspacePaths,
      });
      expect(manager.listConnectedIntegrations()).toEqual(
        expect.arrayContaining(["config", "portable-workspace"])
      );
    });

    it("persiste su sección de configuración tras cada importación", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new ImportManager({ historyDir: tempDir(), configManager });
      const root = tempDir();
      await makeSampleSourceTree(root);
      await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: path.join(tempDir(), "d-config"),
      });

      const section = await configManager.getSection<{ imports: string[] }>("import-manager");
      expect(section?.imports).toHaveLength(1);
    });

    it("registra un warning si la verificación posterior falla, sin fallar la importación", async () => {
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;
      const manager = new ImportManager({
        historyDir: tempDir(),
        verificationManager: fakeVerificationManager,
      });
      const root = tempDir();
      await makeSampleSourceTree(root);

      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: path.join(tempDir(), "d-verify"),
      });

      expect(result.state).toBe("completed_with_warnings");
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("toStatusProvider() informa OK sin fallos y WARNING con importaciones fallidas", async () => {
      const manager = new ImportManager({ historyDir: tempDir() });
      const okStatus = await manager.toStatusProvider().getStatus();
      expect(okStatus.level).toBe("OK");

      await expect(
        manager.importSource({
          sourceType: "folder",
          sourcePath: path.join(tempDir(), "no-existe"),
          destinationPath: path.join(tempDir(), "destino"),
        })
      ).rejects.toBeDefined();

      const warningStatus = await manager.toStatusProvider().getStatus();
      expect(warningStatus.level).toBe("WARNING");
    });

    it("publica eventos y registra logs a través de EventBus y Logger reales", async () => {
      const { Logger, LogLevel } = await import("@dwm/logger");
      const { EventBus } = await import("@dwm/event-bus");
      const eventBus = new EventBus();
      const logger = new Logger("import-manager-test", { minLevel: LogLevel.INFO, transports: [] });
      const received: string[] = [];
      eventBus.subscribe("import.completed", () => {
        received.push("completed");
      });

      const manager = new ImportManager({ historyDir: tempDir(), eventBus, logger });
      const root = tempDir();
      await makeSampleSourceTree(root);
      const result = await manager.importSource({
        sourceType: "folder",
        sourcePath: root,
        destinationPath: path.join(tempDir(), "d-events"),
      });

      expect(result.state).toBe("completed");
      expect(received).toContain("completed");
    });

    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = coreTempDir();
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new ImportManager({ historyDir: tempDir(), configManager });

      await core.registerModule(manager);

      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "import-manager", status: "OK" }),
      ]);
      const section = await configManager.getSection<{ integrations: string[] }>("import-manager");
      expect(section?.integrations).toContain("config");

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
