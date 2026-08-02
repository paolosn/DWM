import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { ProjectManager } from "../../src/ProjectManager.js";
import { ProjectErrorCode } from "../../src/errors/ProjectErrorCode.js";
import { makeTempDir } from "./support/tempDir.js";
import type { ProjectConfiguration } from "../../src/ProjectConfiguration.js";

function cfg(overrides: Partial<ProjectConfiguration> = {}): ProjectConfiguration {
  return {
    projectPath: "/tmp/proyecto",
    profileId: "p1",
    usedTools: [],
    usedAdapters: [],
    ...overrides,
  };
}

describe("ProjectManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-project-core-"));
  }

  it("rechaza opciones sin projectsDir válido", () => {
    expect(() => new ProjectManager({ projectsDir: "" })).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION })
    );
  });

  it("createProject() persiste y registra; listProjects() lo refleja", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Mi Proyecto", "desc", cfg());
    expect(project.state).toBe("created");
    expect(manager.listProjects()).toEqual([project.id]);
    expect(manager.getProject(project.id)?.configuration.profileId).toBe("p1");
  });

  it("createProject() rechaza configuración inválida (sin profileId)", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    await expect(manager.createProject("X", "d", cfg({ profileId: "" }))).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION,
    });
  });

  it("updateProject() actualiza nombre/configuración y persiste", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d1", cfg());

    await manager.updateProject(project.id, {
      name: "Dos",
      configuration: cfg({ usedTools: ["git"] }),
    });

    expect(project.metadata.name).toBe("Dos");
    expect(project.configuration.usedTools).toEqual(["git"]);
  });

  it("updateProject() rechaza configuración inválida", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d1", cfg());
    await expect(
      manager.updateProject(project.id, { configuration: cfg({ usedTools: 1 as never }) })
    ).rejects.toMatchObject({ code: ProjectErrorCode.PROJECT_INVALID_CONFIGURATION });
  });

  it("deleteProject() cierra si estaba abierto, elimina y retira del registro", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d1", cfg());
    await manager.openProject(project.id);

    await manager.deleteProject(project.id);

    expect(manager.listProjects()).toEqual([]);
    await expect(manager.deleteProject(project.id)).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_NOT_FOUND,
    });
  });

  it("cloneProject() crea un nuevo proyecto con la misma configuración", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const source = await manager.createProject("Original", "d", cfg({ usedTools: ["git"] }));

    const cloned = await manager.cloneProject(source.id, "Clon");

    expect(cloned.id).not.toBe(source.id);
    expect(cloned.metadata.name).toBe("Clon");
    expect(cloned.configuration.usedTools).toEqual(["git"]);
  });

  it("exportProject()/importProject() preservan metadatos y configuración", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const source = await manager.createProject("Uno", "d", cfg());
    const bundle = await manager.exportProject(source.id);

    const target = new ProjectManager({ projectsDir: tempDir() });
    const imported = await target.importProject(bundle);

    expect(imported.id).toBe(source.id);
    expect(imported.configuration.profileId).toBe("p1");
  });

  it("importProject() rechaza un paquete que no es JSON válido o le faltan campos", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    await expect(manager.importProject("{ no es json")).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_IMPORT_FAILED,
    });
    await expect(manager.importProject(JSON.stringify({ metadata: {} }))).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_IMPORT_FAILED,
    });
  });

  it("importProject() rechaza sobrescribir sin overwrite:true, y lo permite con overwrite:true", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d", cfg());
    const bundle = await manager.exportProject(project.id);

    await expect(manager.importProject(bundle)).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_ALREADY_EXISTS,
    });
    await expect(manager.importProject(bundle, { overwrite: true })).resolves.toBeDefined();
  });

  it("validateProject() no lanza sin gestores integrados; searchProjects() encuentra por nombre/descripción/ruta", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject(
      "Backend Node",
      "Entorno de backend",
      cfg({ projectPath: "/srv/backend" })
    );
    await manager.createProject(
      "Frontend React",
      "Entorno de frontend",
      cfg({ projectPath: "/srv/frontend" })
    );

    await expect(manager.validateProject(project.id)).resolves.toBeUndefined();
    expect(manager.searchProjects("backend")).toEqual([project.id]);
    expect(manager.searchProjects("entorno").sort()).toEqual(manager.listProjects().sort());
  });

  it("reloadProject() relee desde disco sin alterar el estado", async () => {
    const dir = tempDir();
    const manager = new ProjectManager({ projectsDir: dir });
    const project = await manager.createProject("Uno", "d1", cfg());
    await manager.openProject(project.id);

    const fs = await import("node:fs/promises");
    const raw = JSON.parse(await fs.readFile(`${dir}/${project.id}.json`, "utf-8"));
    raw.metadata.name = "Modificado externamente";
    await fs.writeFile(`${dir}/${project.id}.json`, JSON.stringify(raw), "utf-8");

    await manager.reloadProject(project.id);

    expect(project.metadata.name).toBe("Modificado externamente");
    expect(project.state).toBe("open");
  });

  it("reloadProject() lanza PROJECT_NOT_FOUND si el fichero ya no existe en disco", async () => {
    const dir = tempDir();
    const manager = new ProjectManager({ projectsDir: dir });
    const project = await manager.createProject("Uno", "d1", cfg());
    const fs = await import("node:fs/promises");
    await fs.unlink(`${dir}/${project.id}.json`);

    await expect(manager.reloadProject(project.id)).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_NOT_FOUND,
    });
  });

  it("openProject() orquesta perfil/workspace/tools/adapters de forma tolerante a fallos", async () => {
    const setActiveProfileCalls: string[] = [];
    const profileManager = {
      getProfile: (id: string) => (id === "p1" ? { id } : undefined),
      setActiveProfile: async (id: string) => {
        setActiveProfileCalls.push(id);
      },
    };
    const setActiveWorkspaceCalls: string[] = [];
    const workspaceManager = {
      getWorkspace: (id: string) => (id === "w1" ? { id } : undefined),
      setActiveWorkspace: (id: string) => setActiveWorkspaceCalls.push(id),
    };
    const activateToolCalls: string[] = [];
    const toolingManager = {
      getState: (id: string) => (id === "git" ? "registered" : undefined),
      activateTool: async (id: string) => {
        activateToolCalls.push(id);
      },
    };
    const activateAdapterCalls: string[] = [];
    const adapterManager = {
      getState: (id: string) => (id === "git-adapter" ? "registered" : undefined),
      activateAdapter: async (id: string) => {
        activateAdapterCalls.push(id);
      },
    };

    const manager = new ProjectManager({
      projectsDir: tempDir(),
      profileManager: profileManager as never,
      workspaceManager: workspaceManager as never,
      toolingManager: toolingManager as never,
      adapterManager: adapterManager as never,
    });
    const project = await manager.createProject(
      "Uno",
      "d",
      cfg({ workspaceId: "w1", usedTools: ["git"], usedAdapters: ["git-adapter"] })
    );

    await manager.openProject(project.id);

    expect(setActiveProfileCalls).toEqual(["p1"]);
    expect(setActiveWorkspaceCalls).toEqual(["w1"]);
    expect(activateToolCalls).toEqual(["git"]);
    expect(activateAdapterCalls).toEqual(["git-adapter"]);
    expect(project.state).toBe("open");
    expect(manager.getActiveProject()?.id).toBe(project.id);
  });

  it("openProject() cierra automáticamente el proyecto previamente abierto", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const a = await manager.createProject("A", "d", cfg());
    const b = await manager.createProject("B", "d", cfg());

    await manager.openProject(a.id);
    await manager.openProject(b.id);

    expect(a.state).toBe("closed");
    expect(b.state).toBe("open");
    expect(manager.getActiveProject()?.id).toBe(b.id);
  });

  it("openProject() lanza (conservando PROJECT_VALIDATION_FAILED) si la validación de configuración falla", async () => {
    const profileManager = { getProfile: () => undefined, setActiveProfile: async () => {} };
    const manager = new ProjectManager({
      projectsDir: tempDir(),
      profileManager: profileManager as never,
    });
    const project = await manager.createProject("Uno", "d", cfg());

    await expect(manager.openProject(project.id)).rejects.toMatchObject({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
    });
  });

  it("closeProject() gestiona el cierre manualmente", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d", cfg());

    await manager.openProject(project.id);
    expect(manager.getActiveProject()?.id).toBe(project.id);

    await manager.closeProject(project.id);
    expect(manager.getActiveProject()).toBeUndefined();
  });

  it("getProjectContext() expone getSecret(), getConfigSection() y las integraciones inyectadas", async () => {
    const secretsManager = { getSecret: async (key: string) => `valor-de-${key}` };
    const configManager = new ConfigManager({ configDir: tempDir() });
    await configManager.setSection("project.x", { activo: true });
    const fakeAiManager = { marker: "ai" };
    const manager = new ProjectManager({
      projectsDir: tempDir(),
      secretsManager: secretsManager as never,
      configManager,
      aiManager: fakeAiManager as never,
    });
    const project = await manager.createProject("Uno", "d", cfg());

    const context = manager.getProjectContext(project.id);

    expect(context.aiManager).toBe(fakeAiManager);
    await expect(context.getSecret("k")).resolves.toBe("valor-de-k");
    await expect(context.getConfigSection("project.x")).resolves.toEqual({ activo: true });
  });

  it("getProjectContext() devuelve getSecret()/getConfigSection() → undefined sin integraciones", async () => {
    const manager = new ProjectManager({ projectsDir: tempDir() });
    const project = await manager.createProject("Uno", "d", cfg());
    const context = manager.getProjectContext(project.id);
    await expect(context.getSecret("k")).resolves.toBeUndefined();
    await expect(context.getConfigSection("x")).resolves.toBeUndefined();
  });

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
    const manager = new ProjectManager({ projectsDir: tempDir(), eventBus: fakeBus as never });
    const project = await manager.createProject("Uno", "d", cfg());
    await manager.updateProject(project.id, { name: "Dos" });
    await manager.openProject(project.id);
    await manager.validateProject(project.id);
    await manager.closeProject(project.id);
    await manager.deleteProject(project.id);

    expect(published).toEqual([
      "project.created",
      "project.updated",
      "project.opened",
      "project.validation.ok",
      "project.closed",
      "project.deleted",
    ]);
  });

  it("registra el ciclo de vida a través de un Logger inyectado", async () => {
    const logs: string[] = [];
    const fakeLogger = {
      withCorrelationId: () => ({
        info: async (m: string) => void logs.push(m),
        error: async (m: string) => void logs.push(m),
      }),
    };
    const manager = new ProjectManager({ projectsDir: tempDir(), logger: fakeLogger as never });
    await manager.createProject("Uno", "d", cfg());

    expect(logs.some((m) => m.includes("project:created"))).toBe(true);
  });

  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const manager = new ProjectManager({ projectsDir: tempDir(), configManager });
    await manager.createProject("Uno", "d", cfg());

    await core.registerModule(manager);

    const section = await configManager.getSection<{ projects: string[] }>("project-manager");
    expect(section?.projects).toHaveLength(1);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("programa la revalidación periódica del proyecto activo a través de un Scheduler inyectado", async () => {
    const scheduler = new Scheduler();
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new ProjectManager({
      projectsDir: tempDir(),
      scheduler,
      revalidateIntervalMs: 1000,
    });
    const project = await manager.createProject("Uno", "d", cfg());
    await manager.openProject(project.id);

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

  it("dispose() cancela la revalidación periódica sin modificar el estado de los proyectos", async () => {
    const scheduler = new Scheduler();
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new ProjectManager({
      projectsDir: tempDir(),
      scheduler,
      revalidateIntervalMs: 1000,
    });
    const project = await manager.createProject("Uno", "d", cfg());
    await manager.openProject(project.id);
    await core.registerModule(manager);

    expect(scheduler.statistics().scheduledCount).toBe(1);
    await core.unregisterModule("project-manager");

    expect(scheduler.statistics().scheduledCount).toBe(0);
    expect(project.state).toBe("open");

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new ProjectManager({ projectsDir: tempDir() });

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "project-manager", status: "OK" }),
    ]);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });
});
