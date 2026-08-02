import { describe, it, expect } from "vitest";
import { DWMCore } from "../src/core/DWMCore.js";
import { SystemStatus } from "../src/status/SystemStatus.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { MemoryStorageProvider, makeModule } from "./support/doubles.js";

async function readyCore(): Promise<DWMCore> {
  const core = new DWMCore();
  await core.initialize({ storage: new MemoryStorageProvider() });
  return core;
}

describe("DWMCore — registro de módulos", () => {
  it("[10] registra correctamente un módulo válido", async () => {
    const core = await readyCore();
    let receivedContext: unknown = null;

    await core.registerModule(
      makeModule({
        id: "mod.a",
        init: async (context) => {
          receivedContext = context;
          context.reportStatus(SystemStatus.OK, "listo");
        },
      })
    );

    expect(receivedContext).not.toBeNull();
    const modules = core.listModules();
    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({ id: "mod.a", status: SystemStatus.OK });
    expect(core.getModule("mod.a")).toBeDefined();
  });

  it("[11] rechaza un id de módulo duplicado", async () => {
    const core = await readyCore();
    await core.registerModule(makeModule({ id: "mod.dup" }));

    await expect(core.registerModule(makeModule({ id: "mod.dup" }))).rejects.toMatchObject({
      code: ErrorCode.MODULE_ID_DUPLICATED,
    });
    expect(core.listModules()).toHaveLength(1);
  });

  it("[12] rechaza datos de módulo inválidos", async () => {
    const core = await readyCore();

    await expect(core.registerModule(makeModule({ id: "" }))).rejects.toMatchObject({
      code: ErrorCode.MODULE_INVALID_IDENTITY,
    });
    await expect(core.registerModule(makeModule({ id: "  con-espacios  " }))).rejects.toMatchObject(
      {
        code: ErrorCode.MODULE_INVALID_IDENTITY,
      }
    );
    await expect(
      core.registerModule(makeModule({ id: "mod.sin-version", version: "" }))
    ).rejects.toMatchObject({ code: ErrorCode.MODULE_INVALID_IDENTITY });
    await expect(
      core.registerModule(makeModule({ id: "mod.sin-contrato", contractVersion: "" }))
    ).rejects.toMatchObject({ code: ErrorCode.MODULE_INVALID_IDENTITY });

    expect(core.listModules()).toHaveLength(0);
  });

  it("[13] rechaza un módulo con contrato incompatible", async () => {
    const core = await readyCore();

    await expect(
      core.registerModule(makeModule({ id: "mod.viejo", contractVersion: "0.9.0" }))
    ).rejects.toMatchObject({ code: ErrorCode.MODULE_CONTRACT_INCOMPATIBLE });
    await expect(
      core.registerModule(makeModule({ id: "mod.futuro", contractVersion: "2.0.0" }))
    ).rejects.toMatchObject({ code: ErrorCode.MODULE_CONTRACT_INCOMPATIBLE });

    expect(core.listModules()).toHaveLength(0);
  });

  it("[14] rechaza una versión semántica inválida", async () => {
    const core = await readyCore();

    await expect(
      core.registerModule(makeModule({ id: "mod.v1", version: "1.0" }))
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_SEMANTIC_VERSION });
    await expect(
      core.registerModule(makeModule({ id: "mod.v2", contractVersion: "no-es-semver" }))
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_SEMANTIC_VERSION });

    expect(core.listModules()).toHaveLength(0);
  });

  it("[15] revierte por completo si init() del módulo falla", async () => {
    const core = await readyCore();

    await expect(
      core.registerModule(
        makeModule({
          id: "mod.roto",
          init: async () => {
            throw new Error("fallo deliberado de init()");
          },
        })
      )
    ).rejects.toMatchObject({ code: ErrorCode.MODULE_INIT_FAILED });

    expect(core.listModules()).toHaveLength(0);
    expect(core.getModule("mod.roto")).toBeUndefined();
  });

  it("[16] da de baja correctamente un módulo registrado", async () => {
    const core = await readyCore();
    let disposed = false;
    await core.registerModule(
      makeModule({
        id: "mod.baja",
        dispose: async () => {
          disposed = true;
        },
      })
    );

    await core.unregisterModule("mod.baja");

    expect(disposed).toBe(true);
    expect(core.listModules()).toHaveLength(0);
    expect(core.getModule("mod.baja")).toBeUndefined();
  });

  it("[17] si dispose() falla, el módulo igualmente queda retirado del registro", async () => {
    const core = await readyCore();
    await core.registerModule(
      makeModule({
        id: "mod.dispose-roto",
        dispose: async () => {
          throw new Error("fallo deliberado de dispose()");
        },
      })
    );

    await expect(core.unregisterModule("mod.dispose-roto")).rejects.toMatchObject({
      code: ErrorCode.MODULE_DISPOSE_FAILED,
    });

    // Estado determinista: el módulo ya no está registrado a pesar del fallo.
    expect(core.listModules()).toHaveLength(0);
    expect(core.getModule("mod.dispose-roto")).toBeUndefined();
  });

  it("baja de un módulo inexistente se rechaza con MODULE_NOT_FOUND", async () => {
    const core = await readyCore();
    await expect(core.unregisterModule("no-existe")).rejects.toMatchObject({
      code: ErrorCode.MODULE_NOT_FOUND,
    });
  });
});
