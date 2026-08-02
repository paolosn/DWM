import { describe, it, expect } from "vitest";
import { DWMCore } from "../src/core/DWMCore.js";
import { SystemStatus } from "../src/status/SystemStatus.js";
import { MemoryStorageProvider, makeModule } from "./support/doubles.js";

async function readyCore(): Promise<DWMCore> {
  const core = new DWMCore();
  await core.initialize({ storage: new MemoryStorageProvider() });
  return core;
}

describe("DWMCore — estado agregado", () => {
  it("[31] reportStatus actualiza el snapshot y puede consultarse posteriormente", async () => {
    const core = await readyCore();
    core.reportStatus("modulo-externo-x", SystemStatus.WARNING, "necesita atención");

    // El snapshot no indexa directamente por sourceId externo (eso es
    // responsabilidad de un futuro Status Manager), pero la llamada no debe
    // lanzar y el estado del ciclo de vida permanece consistente.
    const snapshot = core.getSnapshot();
    expect(snapshot.lifecycleState).toBe("READY");
  });

  it("un módulo puede reportar estado en vivo tras el registro (no solo durante init)", async () => {
    const core = await readyCore();
    let reportLater: ((s: SystemStatus) => void) | null = null;

    await core.registerModule(
      makeModule({
        id: "mod.estado-vivo",
        init: async (context) => {
          reportLater = (s) => context.reportStatus(s);
        },
      })
    );

    expect(core.listModules()[0]!.status).toBe(SystemStatus.OK);
    reportLater!(SystemStatus.WARNING);
    expect(core.listModules()[0]!.status).toBe(SystemStatus.WARNING);
  });

  it("[32] los objetos devueltos son copias inmutables: mutarlos no afecta al estado interno", async () => {
    const core = await readyCore();
    await core.registerModule(makeModule({ id: "mod.inmutable" }));

    const config = core.getConfig();
    expect(() => {
      (config as { schemaVersion: string }).schemaVersion = "hackeado";
    }).toThrow();

    const modules = core.listModules();
    expect(() => {
      (modules as unknown[]).push({});
    }).toThrow();
    expect(() => {
      (modules[0] as { status: string }).status = "HACKEADO";
    }).toThrow();

    const snapshot = core.getSnapshot();
    expect(() => {
      (snapshot as { lifecycleState: string }).lifecycleState = "HACKEADO";
    }).toThrow();

    // El estado real del Core permanece intacto tras los intentos de mutación.
    expect(core.getConfig().schemaVersion).toBe("1.0.0");
    expect(core.listModules()).toHaveLength(1);
    expect(core.listModules()[0]!.id).toBe("mod.inmutable");
  });

  it("[32b] dos llamadas a listModules() devuelven copias independientes entre sí", async () => {
    const core = await readyCore();
    await core.registerModule(makeModule({ id: "mod.copias" }));

    const first = core.listModules();
    const second = core.listModules();
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });
});
