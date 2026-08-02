import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import { WorkspacePaths } from "@dwm/portable-workspace";
import { PSNAdapter } from "@dwm/psn-adapter";
import { EnvironmentManager } from "@dwm/environment-manager";
import type { VerificationManager } from "@dwm/verification";
import { PortablePackageManager } from "../../src/PortablePackageManager.js";
import { makeTempDir } from "./support/tempDir.js";

describe("PortablePackageManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }

  async function makeWorkspaceRoot(): Promise<{ root: string; workspacePaths: WorkspacePaths }> {
    const root = tempDir();
    const workspacePaths = new WorkspacePaths(root);
    for (const dir of workspacePaths.requiredDirectories()) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(path.join(workspacePaths.config, "app.json"), JSON.stringify({ ok: true }));
    await fs.writeFile(path.join(workspacePaths.workspace, "nota.txt"), "hola");
    await fs.writeFile(path.join(workspacePaths.secrets, "clave.enc"), "CIFRADO-BASE64-OPACO==");
    return { root, workspacePaths };
  }

  describe("availableResourceSources()", () => {
    it("incluye las rutas estándar de WorkspacePaths", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });
      const ids = manager.availableResourceSources().map((s) => s.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          "workspace",
          "dwm",
          "config",
          "profiles",
          "plugins",
          "backups",
          "logs",
          "tools",
          "runtime",
          "secrets",
        ])
      );
    });

    it("sin workspacePaths ni psnAdapter, no hay fuentes disponibles", () => {
      const manager = new PortablePackageManager({});
      expect(manager.availableResourceSources()).toEqual([]);
    });
  });

  describe("createPackage()", () => {
    it("crea un paquete a partir del Workspace por defecto, sin secretos", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths, dwmVersion: "9.9.9" });
      const zipPath = path.join(tempDir(), "paquete.zip");

      const result = await manager.createPackage({ destinationZipPath: zipPath });
      expect(result.manifest.dwmVersion).toBe("9.9.9");
      expect(result.manifest.entries.some((e) => e.relativePath.startsWith("secrets/"))).toBe(
        false
      );
      expect(result.manifest.entries.some((e) => e.relativePath === "config/app.json")).toBe(true);
    });

    it("no incluye secrets por defecto, pero sí cuando se pide explícitamente, sin descifrar su contenido", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });

      const withoutSecrets = await manager.createPackage({
        destinationZipPath: path.join(tempDir(), "sin-secretos.zip"),
      });
      expect(
        withoutSecrets.manifest.entries.some((e) => e.relativePath.startsWith("secrets/"))
      ).toBe(false);

      const zipPath = path.join(tempDir(), "con-secretos.zip");
      const withSecrets = await manager.createPackage({
        destinationZipPath: zipPath,
        includeSecrets: true,
      });
      expect(withSecrets.manifest.entries.some((e) => e.relativePath === "secrets/clave.enc")).toBe(
        true
      );

      const content = await manager.listPackageContents(zipPath);
      expect(content.some((e) => e.relativePath === "secrets/clave.enc")).toBe(true);
    });

    it("los logs de la operación nunca contienen el contenido de los secretos", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const logs: string[] = [];
      const logger = new Logger("ppm-test", {
        minLevel: LogLevel.INFO,
        transports: [{ write: async (entry) => void logs.push(entry.message) }],
      });
      const manager = new PortablePackageManager({ workspacePaths, logger });

      await manager.createPackage({
        destinationZipPath: path.join(tempDir(), "con-secretos.zip"),
        includeSecrets: true,
      });
      expect(logs.some((m) => m.includes("CIFRADO-BASE64-OPACO"))).toBe(false);
    });

    it("respeta excludePatterns e includeOptionalResources", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      await fs.writeFile(path.join(workspacePaths.logs, "app.log"), "log de prueba");
      const manager = new PortablePackageManager({ workspacePaths });

      const withoutLogs = await manager.createPackage({
        destinationZipPath: path.join(tempDir(), "sin-logs.zip"),
      });
      expect(withoutLogs.manifest.entries.some((e) => e.relativePath.startsWith("logs/"))).toBe(
        false
      );

      const withLogs = await manager.createPackage({
        destinationZipPath: path.join(tempDir(), "con-logs.zip"),
        includeOptionalResources: ["logs"],
      });
      expect(withLogs.manifest.entries.some((e) => e.relativePath === "logs/app.log")).toBe(true);
    });

    it("usa el platform de EnvironmentManager cuando está disponible", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const environmentManager = new EnvironmentManager({ includeBuiltinDetectors: [] });
      const manager = new PortablePackageManager({ workspacePaths, environmentManager });

      const result = await manager.createPackage({
        destinationZipPath: path.join(tempDir(), "p.zip"),
      });
      expect(result.manifest.sourcePlatform).toBe(environmentManager.getPlatformInfo().platform);
    });
  });

  describe("dryRunCreatePackage() / estimatePackageSize()", () => {
    it("informa lo que se incluiría sin escribir ningún ZIP", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });
      const zipPath = path.join(tempDir(), "no-deberia-existir.zip");

      const report = await manager.dryRunCreatePackage({ destinationZipPath: zipPath });
      expect(report.included.length).toBeGreaterThan(0);
      expect(await fs.stat(zipPath).catch(() => undefined)).toBeUndefined();
    });

    it("estimatePackageSize devuelve un tamaño estimado positivo", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });
      const estimate = await manager.estimatePackageSize({});
      expect(estimate.estimatedBytes).toBeGreaterThan(0);
      expect(estimate.entryCount).toBeGreaterThan(0);
    });
  });

  describe("inspección, validación y extracción", () => {
    it("listPackageContents/inspectManifest/validatePackage/extractPackage funcionan de extremo a extremo", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });
      const zipPath = path.join(tempDir(), "paquete.zip");
      await manager.createPackage({ destinationZipPath: zipPath });

      const contents = await manager.listPackageContents(zipPath);
      expect(contents.length).toBeGreaterThan(0);

      const manifest = await manager.inspectManifest(zipPath);
      expect(manifest.entries.length).toBeGreaterThan(0);

      const validation = await manager.validatePackage(zipPath);
      expect(validation.valid).toBe(true);

      const destination = path.join(tempDir(), "destino");
      const extracted = await manager.extractPackage({ zipPath, destinationDir: destination });
      expect(extracted.filesWritten).toBeGreaterThan(0);
      expect(
        await fs
          .readFile(path.join(destination, "config", "app.json"), "utf-8")
          .then((c) => JSON.parse(c))
      ).toEqual({ ok: true });
    });

    it("dryRunExtractPackage no escribe nada", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const manager = new PortablePackageManager({ workspacePaths });
      const zipPath = path.join(tempDir(), "paquete.zip");
      await manager.createPackage({ destinationZipPath: zipPath });

      const destination = path.join(tempDir(), "destino");
      const report = await manager.dryRunExtractPackage({ zipPath, destinationDir: destination });
      expect(report.plannedActions.length).toBeGreaterThan(0);
      expect(await fs.stat(destination).catch(() => undefined)).toBeUndefined();
    });
  });

  describe("integración con PSNAdapter", () => {
    it("incluye los recursos PSN detectados como fuentes disponibles", async () => {
      const psnRoot = tempDir();
      await fs.mkdir(path.join(psnRoot, ".kilo", "agents"), { recursive: true });
      await fs.writeFile(path.join(psnRoot, ".kilo", "agents", "agente.md"), "# Agente\n");
      const psnAdapter = new PSNAdapter();
      await psnAdapter.scanWorkspace(psnRoot);

      const manager = new PortablePackageManager({ psnAdapter });
      const ids = manager.availableResourceSources().map((s) => s.id);
      expect(ids).toContain("psn-agents");
    });
  });

  describe("integraciones y estado", () => {
    it("listConnectedIntegrations() refleja lo integrado", () => {
      const manager = new PortablePackageManager({});
      expect(manager.listConnectedIntegrations()).toEqual([]);
      const configManager = new ConfigManager({ configDir: tempDir() });
      const withConfig = new PortablePackageManager({ configManager });
      expect(withConfig.listConnectedIntegrations()).toEqual(["config"]);
    });

    it("toStatusProvider() siempre informa OK", async () => {
      const manager = new PortablePackageManager({});
      const status = await manager.toStatusProvider().getStatus();
      expect(status.level).toBe("OK");
    });

    it("persiste su sección de configuración tras crear un paquete", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = new PortablePackageManager({ workspacePaths, configManager });
      await manager.createPackage({ destinationZipPath: path.join(tempDir(), "p.zip") });
      const section = await configManager.getSection<{ integrations: string[] }>(
        "portable-package-manager"
      );
      expect(section?.integrations).toBeDefined();
    });

    it("registra un warning vía logger si la verificación posterior falla, sin fallar la operación", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const logs: string[] = [];
      const logger = new Logger("ppm-test-2", {
        minLevel: LogLevel.INFO,
        transports: [{ write: async (entry) => void logs.push(entry.message) }],
      });
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;

      const manager = new PortablePackageManager({
        workspacePaths,
        logger,
        verificationManager: fakeVerificationManager,
      });
      await manager.createPackage({ destinationZipPath: path.join(tempDir(), "p.zip") });
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica eventos a través de un EventBus real", async () => {
      const { workspacePaths } = await makeWorkspaceRoot();
      const eventBus = new EventBus();
      const received: string[] = [];
      eventBus.subscribe("package.created", () => {
        received.push("created");
      });
      eventBus.subscribe("package.validated", () => {
        received.push("validated");
      });
      eventBus.subscribe("package.extracted", () => {
        received.push("extracted");
      });

      const manager = new PortablePackageManager({ workspacePaths, eventBus });
      const zipPath = path.join(tempDir(), "p.zip");
      await manager.createPackage({ destinationZipPath: zipPath });
      await manager.validatePackage(zipPath);
      await manager.extractPackage({ zipPath, destinationDir: path.join(tempDir(), "destino") });

      expect(received).toEqual(["created", "validated", "extracted"]);
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = mkdtempSync(path.join(tmpdir(), "dwm-ppm-core-"));
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const manager = new PortablePackageManager({});

      await core.registerModule(manager);
      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "portable-package-manager", status: "OK" }),
      ]);

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });
});
