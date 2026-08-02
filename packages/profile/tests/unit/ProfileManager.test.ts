import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { ConfigManager } from "@dwm/config";
import { Scheduler } from "@dwm/scheduler";
import { ProfileManager } from "../../src/ProfileManager.js";
import { ProfileErrorCode } from "../../src/errors/ProfileErrorCode.js";
import { defaultProfileConfiguration } from "../../src/ProfileConfiguration.js";
import { makeTempDir } from "./support/tempDir.js";

describe("ProfileManager", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));
  function tempDir(): string {
    const { dir, cleanup } = makeTempDir();
    cleanups.push(cleanup);
    return dir;
  }
  function coreTempDir(): string {
    return mkdtempSync(path.join(tmpdir(), "dwm-profile-core-"));
  }

  it("rechaza opciones sin profilesDir válido", () => {
    expect(() => new ProfileManager({ profilesDir: "" })).toThrow(
      expect.objectContaining({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION })
    );
  });

  it("createProfile() persiste y registra; listProfiles() lo refleja", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Trabajo", "Perfil de trabajo");
    expect(profile.state).toBe("created");
    expect(manager.listProfiles()).toEqual([profile.id]);
    expect(manager.getProfile(profile.id)?.metadata.name).toBe("Trabajo");
  });

  it("createProfile() rechaza configuración inválida", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    await expect(
      manager.createProfile("X", "d", {
        ...defaultProfileConfiguration(),
        enabledTools: "no-array" as never,
      })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION });
  });

  it("updateProfile() actualiza nombre/descripción/configuración y persiste", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d1");

    await manager.updateProfile(profile.id, {
      name: "Dos",
      configuration: { ...defaultProfileConfiguration(), enabledTools: ["git"] },
    });

    expect(profile.metadata.name).toBe("Dos");
    expect(profile.configuration.enabledTools).toEqual(["git"]);
  });

  it("updateProfile() rechaza configuración inválida", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d1");
    await expect(
      manager.updateProfile(profile.id, {
        configuration: { ...defaultProfileConfiguration(), secretRefs: 1 as never },
      })
    ).rejects.toMatchObject({ code: ProfileErrorCode.PROFILE_INVALID_CONFIGURATION });
  });

  it("deleteProfile() desactiva si estaba activo, elimina y retira del registro", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d1");
    await manager.activateProfile(profile.id);

    await manager.deleteProfile(profile.id);

    expect(manager.listProfiles()).toEqual([]);
    await expect(manager.deleteProfile(profile.id)).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_NOT_FOUND,
    });
  });

  it("cloneProfile() crea un nuevo perfil con la misma configuración", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const source = await manager.createProfile("Original", "d", {
      ...defaultProfileConfiguration(),
      enabledTools: ["git"],
    });

    const cloned = await manager.cloneProfile(source.id, "Clon");

    expect(cloned.id).not.toBe(source.id);
    expect(cloned.metadata.name).toBe("Clon");
    expect(cloned.configuration.enabledTools).toEqual(["git"]);
  });

  it("exportProfile()/importProfile() preservan metadatos y configuración; nunca incluyen valores de secretos", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const source = await manager.createProfile("Uno", "d", {
      ...defaultProfileConfiguration(),
      secretRefs: ["api-key"],
    });
    const bundle = await manager.exportProfile(source.id);
    expect(bundle).not.toContain("valor-secreto-real");

    const target = new ProfileManager({ profilesDir: tempDir() });
    const imported = await target.importProfile(bundle);

    expect(imported.id).toBe(source.id);
    expect(imported.configuration.secretRefs).toEqual(["api-key"]);
  });

  it("importProfile() rechaza un paquete que no es JSON válido o le faltan campos", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    await expect(manager.importProfile("{ no es json")).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_IMPORT_FAILED,
    });
    await expect(manager.importProfile(JSON.stringify({ metadata: {} }))).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_IMPORT_FAILED,
    });
  });

  it("importProfile() rechaza sobrescribir sin overwrite:true, y lo permite con overwrite:true", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d");
    const bundle = await manager.exportProfile(profile.id);

    await expect(manager.importProfile(bundle)).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_ALREADY_EXISTS,
    });
    await expect(manager.importProfile(bundle, { overwrite: true })).resolves.toBeDefined();
  });

  it("validateProfile() no lanza sin gestores integrados; searchProfiles() encuentra por nombre/descripción", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Backend Node", "Entorno de backend");
    await manager.createProfile("Frontend React", "Entorno de frontend");

    await expect(manager.validateProfile(profile.id)).resolves.toBeUndefined();
    expect(manager.searchProfiles("backend")).toEqual([profile.id]);
    expect(manager.searchProfiles("entorno").sort()).toEqual(manager.listProfiles().sort());
  });

  it("reloadProfile() relee desde disco sin alterar el estado", async () => {
    const dir = tempDir();
    const manager = new ProfileManager({ profilesDir: dir });
    const profile = await manager.createProfile("Uno", "d1");
    await manager.activateProfile(profile.id);

    const fs = await import("node:fs/promises");
    const raw = JSON.parse(await fs.readFile(`${dir}/${profile.id}.json`, "utf-8"));
    raw.metadata.name = "Modificado externamente";
    await fs.writeFile(`${dir}/${profile.id}.json`, JSON.stringify(raw), "utf-8");

    await manager.reloadProfile(profile.id);

    expect(profile.metadata.name).toBe("Modificado externamente");
    expect(profile.state).toBe("active");
  });

  it("reloadProfile() lanza PROFILE_NOT_FOUND si el fichero ya no existe en disco", async () => {
    const dir = tempDir();
    const manager = new ProfileManager({ profilesDir: dir });
    const profile = await manager.createProfile("Uno", "d1");
    const fs = await import("node:fs/promises");
    await fs.unlink(`${dir}/${profile.id}.json`);

    await expect(manager.reloadProfile(profile.id)).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_NOT_FOUND,
    });
  });

  it("activateProfile() orquesta workspace/tools/adapters/proveedor IA de forma tolerante a fallos", async () => {
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
    const setActiveProviderCalls: string[] = [];
    const aiManager = {
      setActiveProvider: (id: string) => setActiveProviderCalls.push(id),
      getConnection: (id: string) => (id === "openai" ? { providerId: id } : undefined),
    };

    const manager = new ProfileManager({
      profilesDir: tempDir(),
      workspaceManager: workspaceManager as never,
      toolingManager: toolingManager as never,
      adapterManager: adapterManager as never,
      aiManager: aiManager as never,
    });
    const profile = await manager.createProfile("Uno", "d", {
      workspaceId: "w1",
      enabledTools: ["git"],
      enabledAdapters: ["git-adapter"],
      defaultAIProviderId: "openai",
      secretRefs: [],
    });

    await manager.activateProfile(profile.id);

    expect(setActiveWorkspaceCalls).toEqual(["w1"]);
    expect(activateToolCalls).toEqual(["git"]);
    expect(activateAdapterCalls).toEqual(["git-adapter"]);
    expect(setActiveProviderCalls).toEqual(["openai"]);
    expect(profile.state).toBe("active");
    expect(manager.getActiveProfile()?.id).toBe(profile.id);
  });

  it("activateProfile() desactiva automáticamente el perfil previamente activo", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const a = await manager.createProfile("A", "d");
    const b = await manager.createProfile("B", "d");

    await manager.activateProfile(a.id);
    await manager.activateProfile(b.id);

    expect(a.state).toBe("inactive");
    expect(b.state).toBe("active");
    expect(manager.getActiveProfile()?.id).toBe(b.id);
  });

  it("activateProfile() lanza (conservando PROFILE_VALIDATION_FAILED) si la validación de configuración falla", async () => {
    const workspaceManager = { getWorkspace: () => undefined, setActiveWorkspace: () => {} };
    const manager = new ProfileManager({
      profilesDir: tempDir(),
      workspaceManager: workspaceManager as never,
    });
    const profile = await manager.createProfile("Uno", "d", {
      ...defaultProfileConfiguration(),
      workspaceId: "w1",
    });

    await expect(manager.activateProfile(profile.id)).rejects.toMatchObject({
      code: ProfileErrorCode.PROFILE_VALIDATION_FAILED,
    });
  });

  it("setActiveProfile()/deactivateProfile() gestionan la activación manualmente", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d");

    await manager.setActiveProfile(profile.id);
    expect(manager.getActiveProfile()?.id).toBe(profile.id);

    await manager.deactivateProfile(profile.id);
    expect(manager.getActiveProfile()).toBeUndefined();
  });

  it("getProfileContext() expone getSecret(), getConfigSection() y las integraciones inyectadas", async () => {
    const secretsManager = { getSecret: async (key: string) => `valor-de-${key}` };
    const configManager = new ConfigManager({ configDir: tempDir() });
    await configManager.setSection("profile.x", { activo: true });
    const fakeAiManager = { marker: "ai" };
    const manager = new ProfileManager({
      profilesDir: tempDir(),
      secretsManager: secretsManager as never,
      configManager,
      aiManager: fakeAiManager as never,
    });
    const profile = await manager.createProfile("Uno", "d");

    const context = manager.getProfileContext(profile.id);

    expect(context.aiManager).toBe(fakeAiManager);
    await expect(context.getSecret("k")).resolves.toBe("valor-de-k");
    await expect(context.getConfigSection("profile.x")).resolves.toEqual({ activo: true });
  });

  it("getProfileContext() devuelve getSecret()/getConfigSection() → undefined sin integraciones", async () => {
    const manager = new ProfileManager({ profilesDir: tempDir() });
    const profile = await manager.createProfile("Uno", "d");
    const context = manager.getProfileContext(profile.id);
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
    const manager = new ProfileManager({ profilesDir: tempDir(), eventBus: fakeBus as never });
    const profile = await manager.createProfile("Uno", "d");
    await manager.updateProfile(profile.id, { name: "Dos" });
    await manager.activateProfile(profile.id);
    await manager.validateProfile(profile.id);
    await manager.deactivateProfile(profile.id);
    await manager.deleteProfile(profile.id);

    expect(published).toEqual([
      "profile.created",
      "profile.updated",
      "profile.activated",
      "profile.validation.ok",
      "profile.deactivated",
      "profile.deleted",
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
    const manager = new ProfileManager({ profilesDir: tempDir(), logger: fakeLogger as never });
    await manager.createProfile("Uno", "d");

    expect(logs.some((m) => m.includes("profile:created"))).toBe(true);
  });

  it("integra @dwm/config publicando su propia sección al inicializarse en el Core", async () => {
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const configManager = new ConfigManager({ configDir: tempDir() });
    const manager = new ProfileManager({ profilesDir: tempDir(), configManager });
    await manager.createProfile("Uno", "d");

    await core.registerModule(manager);

    const section = await configManager.getSection<{ profiles: string[] }>("profile-manager");
    expect(section?.profiles).toHaveLength(1);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("programa la revalidación periódica del perfil activo a través de un Scheduler inyectado", async () => {
    const scheduler = new Scheduler();
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new ProfileManager({
      profilesDir: tempDir(),
      scheduler,
      revalidateIntervalMs: 1000,
    });
    const profile = await manager.createProfile("Uno", "d");
    await manager.activateProfile(profile.id);

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

  it("dispose() cancela la revalidación periódica sin modificar el estado de los perfiles", async () => {
    const scheduler = new Scheduler();
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });

    const manager = new ProfileManager({
      profilesDir: tempDir(),
      scheduler,
      revalidateIntervalMs: 1000,
    });
    const profile = await manager.createProfile("Uno", "d");
    await manager.activateProfile(profile.id);
    await core.registerModule(manager);

    expect(scheduler.statistics().scheduledCount).toBe(1);
    await core.unregisterModule("profile-manager");

    expect(scheduler.statistics().scheduledCount).toBe(0);
    expect(profile.state).toBe("active");

    await core.shutdown();
    await scheduler.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });

  it("se registra como módulo conforme a IModule en un DWMCore real", async () => {
    const coreDir = coreTempDir();
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(coreDir) });
    const manager = new ProfileManager({ profilesDir: tempDir() });

    await core.registerModule(manager);

    expect(core.listModules()).toEqual([
      expect.objectContaining({ id: "profile-manager", status: "OK" }),
    ]);

    await core.shutdown();
    rmSync(coreDir, { recursive: true, force: true });
  });
});
