import { describe, it, expect } from "vitest";
import { DWMCore } from "../src/core/DWMCore.js";
import { SystemStatus } from "../src/status/SystemStatus.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";
import { MemoryStorageProvider, makeAdapter } from "./support/doubles.js";

async function readyCore(): Promise<DWMCore> {
  const core = new DWMCore();
  await core.initialize({ storage: new MemoryStorageProvider() });
  return core;
}

describe("DWMCore — registro de adaptadores", () => {
  it("[18] registra correctamente un adaptador válido", async () => {
    const core = await readyCore();

    await core.registerAdapter(
      makeAdapter({
        id: "adp.a",
        subjectId: "git",
        init: async (context) => context.reportStatus(SystemStatus.OK),
      })
    );

    const adapters = core.listAdapters();
    expect(adapters).toHaveLength(1);
    expect(adapters[0]).toMatchObject({ id: "adp.a", subjectId: "git", status: SystemStatus.OK });
    expect(core.getAdapter("adp.a")).toBeDefined();
  });

  it("[19] rechaza un id de adaptador duplicado", async () => {
    const core = await readyCore();
    await core.registerAdapter(makeAdapter({ id: "adp.dup", subjectId: "git" }));

    await expect(
      core.registerAdapter(makeAdapter({ id: "adp.dup", subjectId: "vscode" }))
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_ID_DUPLICATED });

    expect(core.listAdapters()).toHaveLength(1);
  });

  it("[20] rechaza un subjectId duplicado, aunque el id del adaptador sea distinto", async () => {
    const core = await readyCore();
    await core.registerAdapter(makeAdapter({ id: "adp.git-1", subjectId: "git" }));

    await expect(
      core.registerAdapter(makeAdapter({ id: "adp.git-2", subjectId: "git" }))
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_SUBJECT_ID_DUPLICATED });

    const adapters = core.listAdapters();
    expect(adapters).toHaveLength(1);
    expect(adapters[0]!.id).toBe("adp.git-1");
    expect(core.getAdapterFor("git")?.id).toBe("adp.git-1");
  });

  it("[21] rechaza datos de adaptador inválidos", async () => {
    const core = await readyCore();

    await expect(core.registerAdapter(makeAdapter({ id: "" }))).rejects.toMatchObject({
      code: ErrorCode.ADAPTER_INVALID_IDENTITY,
    });
    await expect(
      core.registerAdapter(makeAdapter({ id: "adp.sin-subject", subjectId: "" }))
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_INVALID_IDENTITY });
    await expect(
      core.registerAdapter(makeAdapter({ id: "  adp.espacios  ", subjectId: "x" }))
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_INVALID_IDENTITY });

    expect(core.listAdapters()).toHaveLength(0);
  });

  it("[22] rechaza un adaptador con contrato incompatible", async () => {
    const core = await readyCore();

    await expect(
      core.registerAdapter(
        makeAdapter({ id: "adp.viejo", subjectId: "s1", contractVersion: "0.1.0" })
      )
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_CONTRACT_INCOMPATIBLE });

    expect(core.listAdapters()).toHaveLength(0);
  });

  it("[23] revierte por completo si init() del adaptador falla", async () => {
    const core = await readyCore();

    await expect(
      core.registerAdapter(
        makeAdapter({
          id: "adp.roto",
          subjectId: "s-roto",
          init: async () => {
            throw new Error("fallo deliberado de init()");
          },
        })
      )
    ).rejects.toMatchObject({ code: ErrorCode.ADAPTER_INIT_FAILED });

    expect(core.listAdapters()).toHaveLength(0);
    expect(core.getAdapter("adp.roto")).toBeUndefined();
    expect(core.getAdapterFor("s-roto")).toBeUndefined();
  });

  it("[24] da de baja correctamente un adaptador registrado", async () => {
    const core = await readyCore();
    let disposed = false;
    await core.registerAdapter(
      makeAdapter({
        id: "adp.baja",
        subjectId: "s-baja",
        dispose: async () => {
          disposed = true;
        },
      })
    );

    await core.unregisterAdapter("adp.baja");

    expect(disposed).toBe(true);
    expect(core.listAdapters()).toHaveLength(0);
    expect(core.getAdapterFor("s-baja")).toBeUndefined();
  });

  it("[25] si dispose() falla, el adaptador igualmente queda retirado del registro", async () => {
    const core = await readyCore();
    await core.registerAdapter(
      makeAdapter({
        id: "adp.dispose-roto",
        subjectId: "s-dispose-roto",
        dispose: async () => {
          throw new Error("fallo deliberado de dispose()");
        },
      })
    );

    await expect(core.unregisterAdapter("adp.dispose-roto")).rejects.toMatchObject({
      code: ErrorCode.ADAPTER_DISPOSE_FAILED,
    });

    expect(core.listAdapters()).toHaveLength(0);
    expect(core.getAdapterFor("s-dispose-roto")).toBeUndefined();
  });

  it("[26] localiza un adaptador por su subjectId opaco", async () => {
    const core = await readyCore();
    await core.registerAdapter(makeAdapter({ id: "adp.buscable", subjectId: "sujeto-opaco-1" }));

    expect(core.getAdapterFor("sujeto-opaco-1")?.id).toBe("adp.buscable");
    expect(core.getAdapterFor("no-existe")).toBeUndefined();
  });

  it("baja de un adaptador inexistente se rechaza con ADAPTER_NOT_FOUND", async () => {
    const core = await readyCore();
    await expect(core.unregisterAdapter("no-existe")).rejects.toMatchObject({
      code: ErrorCode.ADAPTER_NOT_FOUND,
    });
  });
});
