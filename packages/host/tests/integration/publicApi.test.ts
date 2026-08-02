import { describe, it, expect, afterEach } from "vitest";
import {
  ApplicationHost,
  HostLifecycleState,
  HostError,
  HostErrorCode,
  UseCaseCoordinator,
} from "../../src/index.js";
import { makeComponentDescriptor, makeUseCase } from "../support/doubles.js";
import { makeHostConfiguration, makeTempWorkspace } from "../support/hostConfig.js";

describe("Punto de entrada público (@dwm/host)", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((fn) => fn()));

  it("expone la superficie pública documentada y funciona end-to-end", async () => {
    expect(typeof ApplicationHost.create).toBe("function");
    expect(typeof UseCaseCoordinator).toBe("function");
    expect(HostErrorCode.HOST_INVALID_CONFIGURATION).toBe("HOST_INVALID_CONFIGURATION");

    const ws = makeTempWorkspace();
    cleanups.push(ws.cleanup);

    const secrets = makeComponentDescriptor({
      manifest: { id: "secrets" },
      domainSurface: { get: () => "v" },
    });
    const useCase = makeUseCase({
      id: "uc",
      requiredComponentIds: ["secrets"],
      handle: async (surfaces) => (surfaces.secrets as { get(): string }).get(),
    });
    const config = makeHostConfiguration({
      workspaceRoot: ws.dir,
      components: [secrets],
      useCases: [useCase],
    });

    const host = ApplicationHost.create(config);
    expect(host.getLifecycleState()).toBe(HostLifecycleState.CREATED);

    await host.initialize();
    host.start();
    await expect(host.executeUseCase("uc", undefined)).resolves.toBe("v");
    await host.shutdown();
    expect(host.getLifecycleState()).toBe(HostLifecycleState.STOPPED);

    try {
      await host.initialize();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HostError);
      expect((err as HostError).code).toBe(HostErrorCode.HOST_INVALID_STATE_TRANSITION);
    }
  });
});
