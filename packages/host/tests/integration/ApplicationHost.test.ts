import { describe, it, expect, afterEach } from "vitest";
import { ApplicationHost } from "../../src/host/ApplicationHost.js";
import { HostLifecycleState } from "../../src/host/HostLifecycleState.js";
import { HostErrorCode } from "../../src/errors/HostErrorCatalog.js";
import { makeComponentDescriptor, makeUseCase } from "../support/doubles.js";
import { makeHostConfiguration, makeTempWorkspace } from "../support/hostConfig.js";

describe("ApplicationHost", () => {
  const workspaces: Array<() => void> = [];
  afterEach(() => {
    workspaces.splice(0).forEach((cleanup) => cleanup());
  });
  function tempRoot(): string {
    const ws = makeTempWorkspace();
    workspaces.push(ws.cleanup);
    return ws.dir;
  }

  it("[arranque completo] CREATED → READY → RUNNING con getStatus coherente en cada fase", async () => {
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [makeComponentDescriptor()],
    });
    const host = ApplicationHost.create(config);

    expect(host.getLifecycleState()).toBe(HostLifecycleState.CREATED);
    expect(host.getStatus().core.available).toBe(false);

    await host.initialize();
    expect(host.getLifecycleState()).toBe(HostLifecycleState.READY);
    expect(host.getStatus().core.available).toBe(true);

    host.start();
    expect(host.getLifecycleState()).toBe(HostLifecycleState.RUNNING);
    const status = host.getStatus();
    expect(status.core.available).toBe(true);
    if (status.core.available) {
      expect(status.core.lifecycleState).toBe("RUNNING");
      expect(status.core.snapshot.lifecycleState).toBe("RUNNING");
    }

    await host.shutdown();
    expect(host.getLifecycleState()).toBe(HostLifecycleState.STOPPED);
  });

  it("[consulta de estado antes de crear el Core] indica explícitamente que el Core no está disponible", () => {
    const config = makeHostConfiguration({ workspaceRoot: tempRoot() });
    const host = ApplicationHost.create(config);
    const status = host.getStatus();
    expect(status.hostState).toBe(HostLifecycleState.CREATED);
    expect(status.core).toEqual({ available: false });
  });

  it("ejecuta un caso de uso en RUNNING y lo rechaza fuera de RUNNING", async () => {
    const secrets = makeComponentDescriptor({
      manifest: { id: "secrets" },
      domainSurface: { get: () => "v" },
    });
    const useCase = makeUseCase({
      id: "obtener",
      requiredComponentIds: ["secrets"],
      handle: async (surfaces) => (surfaces.secrets as { get(): string }).get(),
    });
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [secrets],
      useCases: [useCase],
    });
    const host = ApplicationHost.create(config);
    await host.initialize();

    await expect(host.executeUseCase("obtener", undefined)).rejects.toMatchObject({
      code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
    });

    host.start();
    await expect(host.executeUseCase("obtener", undefined)).resolves.toBe("v");
    await expect(host.executeUseCase("no-existe", undefined)).rejects.toMatchObject({
      code: HostErrorCode.HOST_COMPONENT_SERVICE_UNAVAILABLE,
    });

    await host.shutdown();
  });

  it("[uso único] rechaza reinicializar tras STOPPED", async () => {
    const config = makeHostConfiguration({ workspaceRoot: tempRoot() });
    const host = ApplicationHost.create(config);
    await host.initialize();
    await host.shutdown();

    await expect(host.initialize()).rejects.toMatchObject({
      code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
    });
  });

  it("[uso único] rechaza reinicializar tras ERROR", async () => {
    const failing = makeComponentDescriptor({
      manifest: { id: "falla", mandatory: true },
      buildShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [failing] });
    const host = ApplicationHost.create(config);
    await host.initialize();
    expect(host.getLifecycleState()).toBe(HostLifecycleState.ERROR);

    await expect(host.initialize()).rejects.toMatchObject({
      code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
    });
  });

  it("[consulta tras ERROR] devuelve el informe de composición con el error original", async () => {
    const failing = makeComponentDescriptor({
      manifest: { id: "falla", mandatory: true },
      buildShouldFail: true,
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [failing] });
    const host = ApplicationHost.create(config);
    await host.initialize();

    const report = host.getLastStatusReport();
    expect(report.composition?.originalError?.code).toBe(
      HostErrorCode.HOST_MODULE_CONSTRUCTION_FAILED
    );
    expect(host.getStatus().hostState).toBe(HostLifecycleState.ERROR);
  });

  it("[consulta tras STOPPED] devuelve el último informe de apagado", async () => {
    const config = makeHostConfiguration({
      workspaceRoot: tempRoot(),
      components: [makeComponentDescriptor()],
    });
    const host = ApplicationHost.create(config);
    await host.initialize();
    host.start();
    await host.shutdown();

    const report = host.getLastStatusReport();
    expect(report.shutdown?.core?.failures).toEqual([]);
    expect(host.getStatus().hostState).toBe(HostLifecycleState.STOPPED);
  });

  it("no permite start() fuera de READY", async () => {
    const config = makeHostConfiguration({ workspaceRoot: tempRoot() });
    const host = ApplicationHost.create(config);
    expect(() => host.start()).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_STATE_TRANSITION })
    );
  });

  it("no permite initialize() dos veces seguidas sin pasar por STOPPED/ERROR", async () => {
    const config = makeHostConfiguration({ workspaceRoot: tempRoot() });
    const host = ApplicationHost.create(config);
    await host.initialize();
    await expect(host.initialize()).rejects.toMatchObject({
      code: HostErrorCode.HOST_INVALID_STATE_TRANSITION,
    });
    await host.shutdown();
  });

  it("shutdown() solicitado durante la composición cancela cooperativamente y produce STOPPED", async () => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const slow = makeComponentDescriptor({
      manifest: { id: "lento" },
      onInit: async () => {
        await gate;
      },
    });
    const config = makeHostConfiguration({ workspaceRoot: tempRoot(), components: [slow] });
    const host = ApplicationHost.create(config);

    const initPromise = host.initialize();
    // En este punto la composición está en curso (al menos VALIDATING_COMPOSITION).
    await host.shutdown(); // Solicita cancelación cooperativa (no bloqueante).
    releaseGate();
    await initPromise;

    expect(host.getLifecycleState()).toBe(HostLifecycleState.STOPPED);
    expect(host.getLastStatusReport().composition?.cancelled).toBe(true);
  });
});
