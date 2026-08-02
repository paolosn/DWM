import { describe, it, expect } from "vitest";
import { DWMCore } from "../src/core/DWMCore.js";
import { LifecycleState } from "../src/core/LifecycleState.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { DWMError } from "../src/errors/DWMError.js";
import { MemoryStorageProvider, makeModule, makeAdapter } from "./support/doubles.js";

describe("DWMCore — apagado ordenado", () => {
  it("[33] libera correctamente varios módulos y adaptadores", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });

    const disposedIds: string[] = [];
    for (const id of ["mod.1", "mod.2", "mod.3"]) {
      await core.registerModule(makeModule({ id, dispose: async () => void disposedIds.push(id) }));
    }
    for (const [id, subjectId] of [
      ["adp.1", "s1"],
      ["adp.2", "s2"],
    ] as const) {
      await core.registerAdapter(
        makeAdapter({ id, subjectId, dispose: async () => void disposedIds.push(id) })
      );
    }

    const report = await core.shutdown();

    expect(report.failures).toHaveLength(0);
    expect(disposedIds.sort()).toEqual(["adp.1", "adp.2", "mod.1", "mod.2", "mod.3"]);
    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);
    expect(core.listModules()).toHaveLength(0);
    expect(core.listAdapters()).toHaveLength(0);
  });

  it("[34] agrega los fallos cuando varios dispose() fallan, sin detener el apagado", async () => {
    const core = new DWMCore();
    await core.initialize({ storage: new MemoryStorageProvider() });

    await core.registerModule(
      makeModule({
        id: "mod.ok",
        dispose: async () => {
          /* éxito */
        },
      })
    );
    await core.registerModule(
      makeModule({
        id: "mod.falla",
        dispose: async () => {
          throw new Error("fallo deliberado en dispose() de módulo");
        },
      })
    );
    await core.registerAdapter(
      makeAdapter({
        id: "adp.falla",
        subjectId: "s-falla",
        dispose: async () => {
          throw new Error("fallo deliberado en dispose() de adaptador");
        },
      })
    );

    const errorEvents: DWMError[] = [];
    core.on("core:error", ({ error }) => errorEvents.push(error));

    const report = await core.shutdown();

    expect(core.getLifecycleState()).toBe(LifecycleState.STOPPED);
    expect(report.failures).toHaveLength(2);

    const moduleFailure = report.failures.find((f) => f.kind === "module");
    const adapterFailure = report.failures.find((f) => f.kind === "adapter");
    expect(moduleFailure).toMatchObject({ id: "mod.falla" });
    expect(moduleFailure!.error.code).toBe(ErrorCode.MODULE_DISPOSE_FAILED);
    expect(adapterFailure).toMatchObject({ id: "adp.falla" });
    expect(adapterFailure!.error.code).toBe(ErrorCode.ADAPTER_DISPOSE_FAILED);

    // Cada fallo también se emitió individualmente mediante core:error.
    expect(errorEvents).toHaveLength(2);

    // Todos los componentes quedan retirados del registro, fallen o no.
    expect(core.listModules()).toHaveLength(0);
    expect(core.listAdapters()).toHaveLength(0);
  });

  it("shutdown() se rechaza si el Core no está READY/RUNNING", async () => {
    const core = new DWMCore();
    await expect(core.shutdown()).rejects.toMatchObject({ code: ErrorCode.NOT_READY });
  });
});
