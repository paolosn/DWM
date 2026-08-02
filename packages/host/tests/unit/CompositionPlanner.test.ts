import { describe, it, expect } from "vitest";
import { planComposition } from "../../src/composition/CompositionPlanner.js";
import { makeManifest } from "../support/doubles.js";

describe("planComposition — propagación mandatorio/opcional", () => {
  it("un componente opcional sin problemas se construye normalmente", () => {
    const manifest = makeManifest({ id: "opcional", mandatory: false });
    const plan = planComposition([manifest], new Set());
    expect(plan.mandatoryFailures).toHaveLength(0);
    expect(plan.order).toEqual(["opcional"]);
  });

  it("un componente opcional con una dependencia ausente se omite, sin abortar", () => {
    const manifest = makeManifest({
      id: "opcional",
      mandatory: false,
      requiredDependencies: ["red"],
    });
    const plan = planComposition([manifest], new Set());
    expect(plan.mandatoryFailures).toHaveLength(0);
    expect(plan.omitted.get("opcional")).toBe("omitted-by-dependency");
    expect(plan.order).toEqual([]);
  });

  it("un componente mandatorio con una dependencia ausente aborta la composición", () => {
    const manifest = makeManifest({
      id: "mandatorio",
      mandatory: true,
      requiredDependencies: ["red"],
    });
    const plan = planComposition([manifest], new Set());
    expect(plan.mandatoryFailures).toHaveLength(1);
    expect(plan.mandatoryFailures[0]).toMatchObject({
      componentId: "mandatorio",
      reason: "missing-dependency",
    });
  });

  it("[12.3] un componente opcional del que depende uno mandatorio se convierte en fallo mandatorio", () => {
    const provider = makeManifest({
      id: "provider-opcional",
      mandatory: false,
      requiredDependencies: ["red"],
    });
    const consumer = makeManifest({
      id: "consumer-mandatorio",
      mandatory: true,
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    // provider-opcional no provee cap.a a propósito: consumer-mandatorio no
    // encontrará la capacidad, y como consumer es mandatorio, debe abortar.
    const plan = planComposition([provider, consumer], new Set());
    expect(plan.mandatoryFailures.some((f) => f.componentId === "consumer-mandatorio")).toBe(true);
  });

  it("[12.3b] si el proveedor (opcional) de una capacidad mandatoria de un componente mandatorio falla, el fallo se escala", () => {
    const provider = makeManifest({
      id: "provider",
      mandatory: false,
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
      requiredDependencies: ["red"], // provider en sí mismo no puede construirse: falta "red".
    });
    const consumer = makeManifest({
      id: "consumer",
      mandatory: true,
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const plan = planComposition([provider, consumer], new Set());
    // El proveedor se vuelve crítico (heredado de "consumer"), así que su
    // propio fallo (dependencia ausente) debe registrarse como mandatorio.
    expect(plan.mandatoryFailures.some((f) => f.componentId === "provider")).toBe(true);
  });

  it("[12.4] un componente opcional del que solo dependen componentes opcionales omite todo el subgrafo", () => {
    const b = makeManifest({
      id: "b",
      mandatory: false,
      requiredDependencies: ["red"], // b falla: falta la dependencia externa "red".
      providedCapabilities: [{ name: "cap.b", version: "1.0.0" }],
    });
    const c = makeManifest({
      id: "c",
      mandatory: false,
      requiredCapabilities: [{ name: "cap.b", version: "1.0.0", mandatory: true }],
    });
    const plan = planComposition([b, c], new Set());
    expect(plan.mandatoryFailures).toHaveLength(0);
    expect(plan.omitted.get("b")).toBe("omitted-by-dependency");
    expect(plan.omitted.get("c")).toBe("omitted-by-dependency");
  });

  it("un ciclo entre componentes no críticos omite a ambos sin abortar", () => {
    const a = makeManifest({
      id: "a",
      mandatory: false,
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.b", version: "1.0.0", mandatory: true }],
    });
    const b = makeManifest({
      id: "b",
      mandatory: false,
      providedCapabilities: [{ name: "cap.b", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const plan = planComposition([a, b], new Set());
    expect(plan.mandatoryFailures).toHaveLength(0);
    expect(plan.omitted.get("a")).toBe("omitted-by-cycle");
    expect(plan.omitted.get("b")).toBe("omitted-by-cycle");
  });

  it("un ciclo que involucra a un componente mandatorio aborta la composición", () => {
    const a = makeManifest({
      id: "a",
      mandatory: true,
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.b", version: "1.0.0", mandatory: true }],
    });
    const b = makeManifest({
      id: "b",
      mandatory: false,
      providedCapabilities: [{ name: "cap.b", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const plan = planComposition([a, b], new Set());
    expect(plan.mandatoryFailures.length).toBeGreaterThan(0);
  });
});
