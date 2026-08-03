import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { EventBus } from "@dwm/event-bus";
import { Logger, LogLevel } from "@dwm/logger";
import type { Scheduler, TaskHandle, TaskOptions, TaskExecutor } from "@dwm/scheduler";
import type { VerificationManager } from "@dwm/verification";
import { EnvironmentManager } from "../../src/EnvironmentManager.js";
import { EnvironmentErrorCode } from "../../src/errors/EnvironmentErrorCode.js";
import { FakeProcessRunner, FakeSystemInfoProvider } from "./support/fakes.js";
import type { ToolDetectorDefinition } from "../../src/ToolDetector.js";

describe("EnvironmentManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-environment-manager-test-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  function makeManager(
    overrides: {
      systemInfo?: FakeSystemInfoProvider;
      processRunner?: FakeProcessRunner;
      includeBuiltinDetectors?: readonly string[];
      detectors?: readonly ToolDetectorDefinition[];
      [key: string]: unknown;
    } = {}
  ) {
    const systemInfo =
      overrides.systemInfo ?? new FakeSystemInfoProvider({ env: { SHELL: "/bin/bash" } });
    const processRunner = overrides.processRunner ?? new FakeProcessRunner();
    return new EnvironmentManager({
      systemInfo,
      processRunner,
      includeBuiltinDetectors: overrides.includeBuiltinDetectors ?? ["git", "node"],
      ...overrides,
    });
  }

  describe("getPlatformInfo()", () => {
    it("expone plataforma, arquitectura y shell autorizados", () => {
      const systemInfo = new FakeSystemInfoProvider({
        nodePlatform: "linux",
        arch: "x64",
        env: { SHELL: "/bin/zsh" },
      });
      const manager = new EnvironmentManager({ systemInfo, includeBuiltinDetectors: [] });
      expect(manager.getPlatformInfo()).toEqual({
        platform: "linux",
        nodePlatform: "linux",
        architecture: "x64",
        shell: "/bin/zsh",
      });
    });

    it("usa COMSPEC como shell en Windows", () => {
      const systemInfo = new FakeSystemInfoProvider({
        nodePlatform: "win32",
        env: { COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
      });
      const manager = new EnvironmentManager({ systemInfo, includeBuiltinDetectors: [] });
      expect(manager.getPlatformInfo().platform).toBe("windows");
      expect(manager.getPlatformInfo().shell).toBe("C:\\Windows\\System32\\cmd.exe");
    });

    it("omite shell si la variable correspondiente no está definida", () => {
      const systemInfo = new FakeSystemInfoProvider({ nodePlatform: "linux" });
      const manager = new EnvironmentManager({ systemInfo, includeBuiltinDetectors: [] });
      expect(manager.getPlatformInfo().shell).toBeUndefined();
    });
  });

  describe("variables autorizadas", () => {
    it("getAuthorizedVariable()/listAuthorizedVariableNames() delegan en EnvironmentVariables", () => {
      const manager = makeManager();
      expect(manager.listAuthorizedVariableNames()).toContain("SHELL");
      expect(manager.getAuthorizedVariable("SHELL")).toBe("/bin/bash");
      expect(() => manager.getAuthorizedVariable("AWS_SECRET_ACCESS_KEY")).toThrowError(
        expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_VARIABLE_NOT_AUTHORIZED })
      );
    });
  });

  describe("detectores", () => {
    it("listDetectors() incluye únicamente los detectores integrados seleccionados", () => {
      const manager = makeManager({ includeBuiltinDetectors: ["git", "node"] });
      expect(manager.listDetectors().map((d) => d.id)).toEqual(["git", "node"]);
    });

    it("registerDetector() añade un detector personalizado y lo incluye en inspect()", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("herramienta-propia", "/usr/bin/herramienta-propia");
      runner.setRunResult("/usr/bin/herramienta-propia", { stdout: "1.2.3" });
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: [] });

      manager.registerDetector({
        id: "propia",
        name: "Propia",
        category: "cli",
        candidates: [{ command: "herramienta-propia" }],
      });

      const summary = await manager.inspect();
      expect(summary.tools.map((t) => t.id)).toEqual(["propia"]);
      expect(summary.tools[0]?.status).toBe("available");
    });

    it("registerDetector() lanza ante un id ya registrado (colisión)", () => {
      const manager = makeManager({ includeBuiltinDetectors: ["git"] });
      expect(() =>
        manager.registerDetector({
          id: "git",
          name: "Git duplicado",
          category: "vcs",
          candidates: [{ command: "git" }],
        })
      ).toThrowError(
        expect.objectContaining({
          code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_ALREADY_REGISTERED,
        })
      );
    });

    it("unregisterDetector() retira un detector e invalida la caché", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: ["git"] });

      await manager.inspect();
      manager.unregisterDetector("git");
      const summary = await manager.inspect();
      expect(summary.tools).toEqual([]);
    });
  });

  describe("inspect() / caché / refresh()", () => {
    it("detecta todas las herramientas registradas y cachea el resultado", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({
        processRunner: runner,
        includeBuiltinDetectors: ["git", "node"],
      });

      const summary = await manager.inspect();
      expect(summary.availableCount).toBe(1);
      expect(summary.missingCount).toBe(1);
      expect(runner.whichCalls).toEqual(["git", "node"]);

      // Segunda llamada: usa caché, no vuelve a invocar which().
      await manager.inspect();
      expect(runner.whichCalls).toEqual(["git", "node"]);
    });

    it("refresh()/inspect({force:true}) ignoran la caché y vuelven a detectar", async () => {
      const runner = new FakeProcessRunner();
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: ["git"] });

      await manager.inspect();
      await manager.refresh();
      expect(runner.whichCalls).toEqual(["git", "git"]);
    });

    it("invalidateCache() fuerza una nueva detección en la siguiente consulta", async () => {
      const runner = new FakeProcessRunner();
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: ["git"] });
      await manager.inspect();
      manager.invalidateCache();
      await manager.inspect();
      expect(runner.whichCalls).toEqual(["git", "git"]);
    });
  });

  describe("getTool()", () => {
    it("detecta una única herramienta y no requiere inspeccionar todas", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({
        processRunner: runner,
        includeBuiltinDetectors: ["git", "node"],
      });

      const git = await manager.getTool("git");
      expect(git.status).toBe("available");
      expect(runner.whichCalls).toEqual(["git"]);
    });

    it("usa la caché de inspect() si ya existe, salvo force: true", async () => {
      const runner = new FakeProcessRunner();
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: ["git"] });
      await manager.inspect();
      runner.whichCalls.length = 0;

      await manager.getTool("git");
      expect(runner.whichCalls).toEqual([]);

      await manager.getTool("git", { force: true });
      expect(runner.whichCalls).toEqual(["git"]);
    });

    it("actualiza la entrada correspondiente de una caché ya existente", async () => {
      const runner = new FakeProcessRunner();
      const manager = makeManager({
        processRunner: runner,
        includeBuiltinDetectors: ["git", "node"],
      });
      const before = await manager.inspect();
      expect(before.tools.find((t) => t.id === "git")?.status).toBe("missing");

      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      await manager.getTool("git", { force: true });

      const after = await manager.inspect();
      expect(after.tools.find((t) => t.id === "git")?.status).toBe("available");
      expect(after.tools.find((t) => t.id === "node")?.status).toBe("missing");
    });

    it("lanza ENVIRONMENT_DETECTOR_NOT_FOUND para un id sin detector registrado", async () => {
      const manager = makeManager({ includeBuiltinDetectors: [] });
      await expect(manager.getTool("no-existe")).rejects.toMatchObject({
        code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_NOT_FOUND,
      });
    });
  });

  describe("listTools() / filterTools()", () => {
    it("listTools() devuelve todos los resultados de la última inspección", async () => {
      const manager = makeManager({ includeBuiltinDetectors: ["git", "node"] });
      const tools = await manager.listTools();
      expect(tools.map((t) => t.id).sort()).toEqual(["git", "node"]);
    });

    it("filterTools() filtra por status y por category", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({
        processRunner: runner,
        includeBuiltinDetectors: ["git", "node"],
      });

      expect((await manager.filterTools({ status: "available" })).map((t) => t.id)).toEqual([
        "git",
      ]);
      expect((await manager.filterTools({ status: "missing" })).map((t) => t.id)).toEqual(["node"]);
      expect((await manager.filterTools({ category: "vcs" })).map((t) => t.id)).toEqual(["git"]);
    });
  });

  describe("validateRequirements()", () => {
    it("valida requisitos contra la última inspección", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({
        processRunner: runner,
        includeBuiltinDetectors: ["git", "node"],
      });

      const result = await manager.validateRequirements([
        { toolId: "git", minVersion: "2.0.0" },
        { toolId: "node", required: false },
      ]);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(2);
    });
  });

  describe("compareVersions() / satisfiesMinimumVersion()", () => {
    it("compareVersions() delega en VersionComparator", () => {
      const manager = makeManager({ includeBuiltinDetectors: [] });
      expect(manager.compareVersions("1.0.0", "2.0.0")).toBe(-1);
    });

    it("satisfiesMinimumVersion() consulta la herramienta y compara su versión", async () => {
      const runner = new FakeProcessRunner();
      runner.setExecutable("git", "/usr/bin/git");
      runner.setRunResult("/usr/bin/git", { stdout: "git version 2.43.0" });
      const manager = makeManager({ processRunner: runner, includeBuiltinDetectors: ["git"] });

      expect(await manager.satisfiesMinimumVersion("git", "2.0.0")).toBe(true);
      expect(await manager.satisfiesMinimumVersion("git", "3.0.0")).toBe(false);
    });

    it("satisfiesMinimumVersion() es falso si la herramienta no está disponible", async () => {
      const manager = makeManager({ includeBuiltinDetectors: ["git"] });
      expect(await manager.satisfiesMinimumVersion("git", "2.0.0")).toBe(false);
    });
  });

  describe("integraciones", () => {
    it("listConnectedIntegrations() está vacío por defecto y refleja lo integrado", () => {
      const withoutIntegrations = makeManager({ includeBuiltinDetectors: [] });
      expect(withoutIntegrations.listConnectedIntegrations()).toEqual([]);

      const configManager = new ConfigManager({ configDir: tempDir() });
      const withIntegrations = makeManager({ includeBuiltinDetectors: [], configManager });
      expect(withIntegrations.listConnectedIntegrations()).toEqual(["config"]);
    });

    it("persiste su sección de configuración tras cada inspección", async () => {
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ includeBuiltinDetectors: ["git"], configManager });
      await manager.inspect();
      const section = await configManager.getSection<{ available: number; missing: number }>(
        "environment-manager"
      );
      expect(section?.missing).toBe(1);
    });

    it("registra un warning vía logger si la verificación posterior falla, sin fallar la inspección", async () => {
      const logs: string[] = [];
      const logger = new Logger("environment-manager-test", {
        minLevel: LogLevel.INFO,
        transports: [{ write: async (entry) => void logs.push(entry.message) }],
      });
      const fakeVerificationManager = {
        verify: async () => {
          throw new Error("verificación no disponible");
        },
      } as unknown as VerificationManager;

      const manager = makeManager({
        includeBuiltinDetectors: ["git"],
        logger,
        verificationManager: fakeVerificationManager,
      });
      const summary = await manager.inspect();
      expect(summary.missingCount).toBe(1);
      expect(logs.some((m) => m.includes("verificación"))).toBe(true);
    });

    it("publica un evento a través de un EventBus real tras cada inspección", async () => {
      const eventBus = new EventBus();
      const received: unknown[] = [];
      eventBus.subscribe("environment.inspected", (payload) => {
        received.push(payload);
      });
      const manager = makeManager({ includeBuiltinDetectors: ["git"], eventBus });
      await manager.inspect();
      expect(received).toHaveLength(1);
    });
  });

  describe("toStatusProvider()", () => {
    it("informa UNKNOWN antes de la primera inspección, y OK con el recuento tras ella", async () => {
      const manager = makeManager({ includeBuiltinDetectors: ["git"] });
      const before = await manager.toStatusProvider().getStatus();
      expect(before.level).toBe("UNKNOWN");

      await manager.inspect();
      const after = await manager.toStatusProvider().getStatus();
      expect(after.level).toBe("OK");
      expect(after.detail?.["missing"]).toBe(1);
    });
  });

  describe("refresco periódico con Scheduler", () => {
    it("programa una tarea de refresco al inicializar y la cancela al liberar", async () => {
      const scheduled: Array<{ options: TaskOptions; executor: TaskExecutor }> = [];
      const cancelCalls: string[] = [];
      const fakeScheduler = {
        schedule: (executor: TaskExecutor, options: TaskOptions = {}): TaskHandle => {
          scheduled.push({ executor, options });
          return {
            id: options.id ?? "task",
            cancel: () => {
              cancelCalls.push(options.id ?? "task");
            },
          } as unknown as TaskHandle;
        },
      } as unknown as Scheduler;

      const manager = makeManager({
        includeBuiltinDetectors: ["git"],
        scheduler: fakeScheduler,
        refreshIntervalMs: 60000,
      });

      await manager.init({
        getConfig: () => ({}) as never,
        getActiveProfile: () => null,
        reportStatus: () => undefined,
        eventBus: { emit: async () => undefined } as never,
      });
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]?.options).toMatchObject({ id: "environment-refresh", intervalMs: 60000 });

      await manager.dispose();
      expect(cancelCalls).toEqual(["environment-refresh"]);
    });

    it("no programa nada si falta refreshIntervalMs aunque haya scheduler", async () => {
      const fakeScheduler = {
        schedule: () => ({ cancel: () => undefined }),
      } as unknown as Scheduler;
      const manager = makeManager({ includeBuiltinDetectors: [], scheduler: fakeScheduler });
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });

  describe("IModule", () => {
    it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
      const coreDir = mkdtempSync(path.join(tmpdir(), "dwm-environment-manager-core-"));
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
      const configManager = new ConfigManager({ configDir: tempDir() });
      const manager = makeManager({ includeBuiltinDetectors: [], configManager });

      await core.registerModule(manager);
      expect(core.listModules()).toEqual([
        expect.objectContaining({ id: "environment-manager", status: "OK" }),
      ]);

      await manager.dispose();
      await core.shutdown();
      rmSync(coreDir, { recursive: true, force: true });
    });
  });

  describe("openInVSCode()", () => {
    it("resuelve 'code' en PATH (mismo ProcessRunner que VSCodeDetector) y lo lanza sobre la carpeta del proyecto", async () => {
      const processRunner = new FakeProcessRunner();
      processRunner.setExecutable("code", "/usr/local/bin/code");
      processRunner.setRunResult("/usr/local/bin/code", { stdout: "" });
      const manager = makeManager({ processRunner });

      const result = await manager.openInVSCode("/home/user/proyectos/portal-clientes");

      expect(result.opened).toBe(true);
      expect(result.message).toContain("/home/user/proyectos/portal-clientes");
    });

    it("informa con claridad, sin fallar, si 'code' no está en PATH", async () => {
      const manager = makeManager({ processRunner: new FakeProcessRunner() });

      const result = await manager.openInVSCode("/home/user/proyectos/portal-clientes");

      expect(result.opened).toBe(false);
      expect(result.message).toContain("PATH");
    });

    it("si el lanzamiento del CLI falla, informa sin ocultar que el proyecto ya se creó", async () => {
      const processRunner = new FakeProcessRunner();
      processRunner.setExecutable("code", "/usr/local/bin/code");
      processRunner.setRunResult("/usr/local/bin/code", {
        exitCode: 1,
        stderr: "fallo inesperado",
      });
      const manager = makeManager({ processRunner });

      const result = await manager.openInVSCode("/home/user/proyectos/portal-clientes");

      expect(result.message).toContain("se creó correctamente");
    });
  });
});
