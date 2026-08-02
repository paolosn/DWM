import { describe, it, expect } from "vitest";
import { DWMCore } from "../src/core/DWMCore.js";
import { LifecycleState, isTransitionAllowed } from "../src/core/LifecycleState.js";
import { SystemStatus } from "../src/status/SystemStatus.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { DWMError } from "../src/errors/DWMError.js";
import { MemoryStorageProvider } from "./support/doubles.js";

describe("DWMCore — inicialización y configuración", () => {
  it("[1] primera ejecución crea configuración por defecto y perfil Pendiente", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider();

    await core.initialize({ storage });

    expect(core.getLifecycleState()).toBe(LifecycleState.READY);
    const config = core.getConfig();
    expect(config.schemaVersion).toBe("1.0.0");
    expect(config.activeProfileId).toBeNull();
    expect(core.getActiveProfile()).toBeNull();

    const snapshot = core.getSnapshot();
    expect(snapshot.configStatus).toBe(SystemStatus.OK);
    expect(snapshot.profileStatus).toBe(SystemStatus.PENDING);
  });

  it("[2] carga una configuración ya existente sin sobrescribirla", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider();
    storage.seed(
      "config.json",
      JSON.stringify({
        schemaVersion: "1.0.0",
        activeProfileId: null,
        preferences: {
          backupFrequency: "daily",
          notifyUpdates: false,
          logLevel: "debug",
        },
      })
    );

    await core.initialize({ storage });

    const config = core.getConfig();
    expect(config.preferences.backupFrequency).toBe("daily");
    expect(config.preferences.notifyUpdates).toBe(false);
    expect(config.preferences.logLevel).toBe("debug");
  });

  it("[3] carga el perfil activo declarado en la configuración", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider();
    storage.seed(
      "config.json",
      JSON.stringify({
        schemaVersion: "1.0.0",
        activeProfileId: "perfil-1",
        preferences: { backupFrequency: "manual", notifyUpdates: true, logLevel: "info" },
      })
    );
    storage.seed(
      "profiles/perfil-1.json",
      JSON.stringify({
        id: "perfil-1",
        name: "Perfil de prueba",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
    );

    await core.initialize({ storage });

    const profile = core.getActiveProfile();
    expect(profile).not.toBeNull();
    expect(profile!.id).toBe("perfil-1");
    expect(profile!.name).toBe("Perfil de prueba");
    expect(core.getSnapshot().profileStatus).toBe(SystemStatus.OK);
  });

  it("[4] un perfil activo inexistente se trata como Pendiente, no como error", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider();
    storage.seed(
      "config.json",
      JSON.stringify({
        schemaVersion: "1.0.0",
        activeProfileId: "perfil-fantasma",
        preferences: { backupFrequency: "manual", notifyUpdates: true, logLevel: "info" },
      })
    );
    // No se siembra profiles/perfil-fantasma.json a propósito.

    await core.initialize({ storage });

    expect(core.getLifecycleState()).toBe(LifecycleState.READY);
    expect(core.getActiveProfile()).toBeNull();
    expect(core.getSnapshot().profileStatus).toBe(SystemStatus.PENDING);
  });

  it("[5] ciclo completo READY → RUNNING → SHUTTING_DOWN → STOPPED", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });
    expect(core.getLifecycleState()).toBe(LifecycleState.READY);

    const transitions: string[] = [];
    core.on("core:lifecycle-changed", ({ to }) => transitions.push(to));

    core.markRunning();
    expect(core.getLifecycleState()).toBe(LifecycleState.RUNNING);

    const report = await core.shutdown();
    expect(report.failures).toHaveLength(0);
    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);

    // La secuencia completa de transiciones ocurrió en el orden esperado,
    // incluyendo el paso por SHUTTING_DOWN aunque no haya trabajo asíncrono
    // real que disponer (registros vacíos).
    expect(transitions).toEqual([
      LifecycleState.RUNNING,
      LifecycleState.SHUTTING_DOWN,
      LifecycleState.STOPPED,
    ]);
  });

  it("[6] una transición de ciclo de vida no permitida se rechaza", async () => {
    // READY nunca puede volver directamente a LOADING_CONFIG.
    expect(isTransitionAllowed(LifecycleState.READY, LifecycleState.LOADING_CONFIG)).toBe(false);
    // UNINITIALIZED solo puede ir a BOOTSTRAPPING.
    expect(isTransitionAllowed(LifecycleState.UNINITIALIZED, LifecycleState.READY)).toBe(false);
    expect(isTransitionAllowed(LifecycleState.UNINITIALIZED, LifecycleState.BOOTSTRAPPING)).toBe(
      true
    );
  });

  it("[7] una segunda llamada a initialize() sobre una instancia ya inicializada se rechaza", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });

    await expect(core.initialize({ storage: new MemoryStorageProvider() })).rejects.toMatchObject({
      code: ErrorCode.ALREADY_INITIALIZED,
    });
  });

  it("[7b] initialize() se rechaza mientras hay una inicialización en curso", async () => {
    const core = new DWMCore();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const storage = new MemoryStorageProvider({
      delayReadFor: new Map([["config.json", () => gate]]),
    });

    const firstInit = core.initialize({ storage });
    // Hasta el primer `await` interno, el resto de initialize() es síncrono:
    // el estado ya refleja LOADING_CONFIG en este punto.
    expect(core.getLifecycleState()).toBe(LifecycleState.LOADING_CONFIG);

    await expect(core.initialize({ storage: new MemoryStorageProvider() })).rejects.toMatchObject({
      code: ErrorCode.INITIALIZATION_IN_PROGRESS,
    });

    release();
    await firstInit;
    expect(core.getLifecycleState()).toBe(LifecycleState.READY);
  });

  it("[8] initialize() después de STOPPED reinicia el Core desde cero", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider();
    await core.initialize({ storage });
    await core.registerModule({
      id: "test.mod",
      version: "1.0.0",
      contractVersion: "1.0.0",
      init: async () => {},
    });
    await core.shutdown();
    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);

    await core.initialize({ storage: new MemoryStorageProvider() });

    expect(core.getLifecycleState()).toBe(LifecycleState.READY);
    expect(core.listModules()).toHaveLength(0);
    expect(core.getSnapshot().profileStatus).toBe(SystemStatus.PENDING);
  });

  it("[9] un fallo no recuperable durante el arranque transiciona a ERROR y emite core:error", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider({ failReadFor: new Set(["config.json"]) });

    const errors: DWMError[] = [];
    core.on("core:error", ({ error }) => errors.push(error));

    await expect(core.initialize({ storage })).rejects.toMatchObject({
      code: ErrorCode.CONFIG_LOAD_FAILED,
    });

    expect(core.getLifecycleState()).toBe(LifecycleState.ERROR);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe(ErrorCode.CONFIG_LOAD_FAILED);
  });

  it("[9b] tras ERROR, initialize() permite reintentar explícitamente", async () => {
    const core = new DWMCore();
    const badStorage = new MemoryStorageProvider({ failReadFor: new Set(["config.json"]) });
    await expect(core.initialize({ storage: badStorage })).rejects.toBeTruthy();
    expect(core.getLifecycleState()).toBe(LifecycleState.ERROR);

    const goodStorage = new MemoryStorageProvider();
    await core.initialize({ storage: goodStorage });
    expect(core.getLifecycleState()).toBe(LifecycleState.READY);
  });
});

describe("DWMCore — guardas de ciclo de vida", () => {
  it("[35] las operaciones que requieren un Core listo se rechazan antes de READY", async () => {
    const core = new DWMCore();
    expect(() => core.getConfig()).toThrow(DWMError);
    expect(() => core.getConfig()).toThrow(expect.objectContaining({ code: ErrorCode.NOT_READY }));
    expect(() => core.getActiveProfile()).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_READY })
    );
    expect(() => core.listModules()).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_READY })
    );
    expect(() => core.listAdapters()).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_READY })
    );
    expect(() => core.markRunning()).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_READY })
    );

    await expect(
      core.registerModule({
        id: "x",
        version: "1.0.0",
        contractVersion: "1.0.0",
        init: async () => {},
      })
    ).rejects.toMatchObject({ code: ErrorCode.NOT_READY });

    // Diagnóstico: siempre disponible, incluso antes de READY.
    expect(core.getLifecycleState()).toBe(LifecycleState.UNINITIALIZED);
    expect(() => core.getSnapshot()).not.toThrow();
  });

  it("[36] durante ERROR, las operaciones mutantes se rechazan pero el diagnóstico sigue disponible", async () => {
    const core = new DWMCore();
    const storage = new MemoryStorageProvider({ failReadFor: new Set(["config.json"]) });
    await expect(core.initialize({ storage })).rejects.toBeTruthy();
    expect(core.getLifecycleState()).toBe(LifecycleState.ERROR);

    await expect(
      core.registerModule({
        id: "x",
        version: "1.0.0",
        contractVersion: "1.0.0",
        init: async () => {},
      })
    ).rejects.toMatchObject({ code: ErrorCode.NOT_READY });

    expect(() => core.getSnapshot()).not.toThrow();
    expect(core.getSnapshot().lifecycleState).toBe(LifecycleState.ERROR);
  });

  it("[37] después de STOPPED, las escrituras se rechazan pero las lecturas siguen disponibles", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });
    await core.shutdown();
    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);

    await expect(
      core.registerModule({
        id: "x",
        version: "1.0.0",
        contractVersion: "1.0.0",
        init: async () => {},
      })
    ).rejects.toMatchObject({ code: ErrorCode.NOT_READY });

    expect(() => core.getConfig()).not.toThrow();
    expect(core.listModules()).toEqual([]);
  });
});
