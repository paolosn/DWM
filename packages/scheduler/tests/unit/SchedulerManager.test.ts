import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { SchedulerManager } from "../../src/SchedulerManager.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("SchedulerManager — integración con DWMCore real", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-scheduler-manager-"));
    dirs.push(dir);
    return dir;
  }
  async function readyCore(): Promise<DWMCore> {
    const core = new DWMCore();
    await core.initialize({ storage: new FileSystemStorageProvider(tempDir()) });
    return core;
  }

  it("se registra como módulo conforme a IModule y reporta estado OK", async () => {
    const core = await readyCore();
    const manager = new SchedulerManager();

    await core.registerModule(manager);

    const modules = core.listModules();
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ id: "scheduler-manager", status: "OK" });

    await core.shutdown();
  });

  it("getScheduler() expone un Scheduler operativo", async () => {
    const manager = new SchedulerManager();
    let executed = false;
    manager.getScheduler().schedule(() => {
      executed = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(executed).toBe(true);
  });

  it("dispose() ejecuta el apagado limpio del Scheduler subyacente", async () => {
    const core = await readyCore();
    const manager = new SchedulerManager();
    await core.registerModule(manager);

    let resolveTask: () => void = () => {};
    manager.getScheduler().schedule(
      () =>
        new Promise<void>((resolve) => {
          resolveTask = resolve;
        })
    );
    await vi.advanceTimersByTimeAsync(0);

    let unregistered = false;
    const unregisterPromise = core.unregisterModule("scheduler-manager").then(() => {
      unregistered = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(unregistered).toBe(false);

    resolveTask();
    await unregisterPromise;
    expect(unregistered).toBe(true);

    await core.shutdown();
  });

  it("acepta configuration, logger y eventBus explícitos en el constructor", async () => {
    const fakeLogger = {
      withCorrelationId: () => fakeLogger,
      info: async () => {},
      error: async () => {},
      debug: async () => {},
    };
    const fakeBus = {
      publish: async (type: string) => ({
        eventId: "e",
        type,
        matched: 0,
        delivered: 0,
        cancelledByMiddleware: false,
        propagationStopped: false,
        errors: [],
      }),
    };
    const manager = new SchedulerManager({
      configuration: { maxConcurrency: 2 },
      logger: fakeLogger as never,
      eventBus: fakeBus as never,
    });
    let executed = false;
    manager.getScheduler().schedule(() => {
      executed = true;
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(executed).toBe(true);
  });
});
