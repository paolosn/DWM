import { describe, it, expect } from "vitest";
import { DWMCore, FileSystemStorageProvider } from "@dwm/core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { UseCaseCoordinator } from "../../src/coordinators/UseCaseCoordinator.js";
import { LifecycleCoordinator } from "../../src/coordinators/LifecycleCoordinator.js";
import { ShutdownCoordinator } from "../../src/coordinators/ShutdownCoordinator.js";
import { CleanupStack } from "../../src/composition/CleanupStack.js";
import { HostErrorCode } from "../../src/errors/HostErrorCatalog.js";

describe("UseCaseCoordinator", () => {
  it("ejecuta el handler con las superficies recibidas", async () => {
    const coordinator = new UseCaseCoordinator(
      "uc",
      { a: { value: 1 } },
      async (surfaces, input) => {
        return (surfaces.a as { value: number }).value + (input as number);
      }
    );
    await expect(coordinator.execute(2)).resolves.toBe(3);
  });

  it("envuelve un fallo del handler como HOST_USE_CASE_FAILED", async () => {
    const coordinator = new UseCaseCoordinator("uc-roto", {}, async () => {
      throw new Error("boom");
    });
    await expect(coordinator.execute(undefined)).rejects.toMatchObject({
      code: HostErrorCode.HOST_USE_CASE_FAILED,
    });
  });
});

describe("LifecycleCoordinator", () => {
  function tempRoot(): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-host-lifecycle-"));
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it("invoca markRunning() sobre un Core inicializado", async () => {
    const { dir, cleanup } = tempRoot();
    try {
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(dir) });
      new LifecycleCoordinator().start(core);
      expect(core.getLifecycleState()).toBe("RUNNING");
      await core.shutdown();
    } finally {
      cleanup();
    }
  });

  it("envuelve el fallo de markRunning() como HOST_INVALID_STATE_TRANSITION", async () => {
    const core = new DWMCore(); // nunca inicializado: markRunning() debe rechazarse.
    expect(() => new LifecycleCoordinator().start(core)).toThrow(
      expect.objectContaining({ code: HostErrorCode.HOST_INVALID_STATE_TRANSITION })
    );
  });
});

describe("ShutdownCoordinator", () => {
  it("agrega el ShutdownReport del Core y los fallos de limpieza del host", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dwm-host-shutdown-"));
    try {
      const core = new DWMCore();
      await core.initialize({ storage: new FileSystemStorageProvider(dir) });

      const cleanupStack = new CleanupStack();
      cleanupStack.push({
        kind: "external-dependency",
        id: "red",
        dispose: async () => {
          throw new Error("fallo al liberar red");
        },
      });

      const summary = await new ShutdownCoordinator().shutdown(core, cleanupStack);

      expect(summary.core?.failures).toEqual([]);
      expect(summary.externalDependencyFailures).toHaveLength(1);
      expect(summary.externalDependencyFailures[0]!.id).toBe("red");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("funciona si el Core nunca llegó a crearse", async () => {
    const cleanupStack = new CleanupStack();
    const summary = await new ShutdownCoordinator().shutdown(undefined, cleanupStack);
    expect(summary.core).toBeUndefined();
    expect(summary.externalDependencyFailures).toEqual([]);
  });
});
