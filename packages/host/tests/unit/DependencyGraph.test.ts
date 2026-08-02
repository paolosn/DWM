import { describe, it, expect } from "vitest";
import { DependencyGraph } from "../../src/composition/DependencyGraph.js";
import { makeManifest } from "../support/doubles.js";

describe("DependencyGraph", () => {
  it("no reporta problemas cuando todas las capacidades y dependencias están satisfechas", () => {
    const provider = makeManifest({
      id: "provider",
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
    });
    const consumer = makeManifest({
      id: "consumer",
      requiredCapabilities: [{ name: "cap.a", version: "1.2.0", mandatory: true }],
      requiredDependencies: ["clock"],
    });

    const graph = new DependencyGraph([provider, consumer], new Set(["clock"]));
    expect(graph.getIssues()).toHaveLength(0);
    expect(graph.getEdges()).toHaveLength(1);
    expect(graph.getEdges()[0]).toMatchObject({
      from: "consumer",
      to: "provider",
      capabilityName: "cap.a",
    });
  });

  it("reporta capability-unavailable si ningún proveedor coincide en nombre o versión mayor", () => {
    const consumer = makeManifest({
      id: "consumer",
      requiredCapabilities: [{ name: "cap.x", version: "2.0.0", mandatory: true }],
    });
    const provider = makeManifest({
      id: "provider",
      providedCapabilities: [{ name: "cap.x", version: "1.0.0" }],
    });

    const graph = new DependencyGraph([consumer, provider], new Set());
    const issues = graph.getIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      componentId: "consumer",
      reason: "capability-unavailable",
      mandatory: true,
    });
  });

  it("reporta missing-dependency si una dependencia externa declarada no está disponible", () => {
    const manifest = makeManifest({ id: "needs-storage", requiredDependencies: ["storage"] });
    const graph = new DependencyGraph([manifest], new Set());
    expect(graph.getIssues()).toEqual([
      expect.objectContaining({
        componentId: "needs-storage",
        reason: "missing-dependency",
        mandatory: true,
      }),
    ]);
  });

  it("no reporta problema si la capacidad requerida no es mandatoria y está ausente", () => {
    const consumer = makeManifest({
      id: "consumer",
      requiredCapabilities: [{ name: "cap.opcional", version: "1.0.0", mandatory: false }],
    });
    const graph = new DependencyGraph([consumer], new Set());
    const issues = graph.getIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.mandatory).toBe(false);
  });

  it("detecta un ciclo simple entre dos componentes", () => {
    const a = makeManifest({
      id: "a",
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.b", version: "1.0.0", mandatory: true }],
    });
    const b = makeManifest({
      id: "b",
      providedCapabilities: [{ name: "cap.b", version: "1.0.0" }],
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });

    const graph = new DependencyGraph([a, b], new Set());
    const cycle = graph.detectCycles();
    expect(cycle.has("a")).toBe(true);
    expect(cycle.has("b")).toBe(true);
  });

  it("no detecta ciclo en un grafo lineal", () => {
    const a = makeManifest({
      id: "a",
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
    });
    const b = makeManifest({
      id: "b",
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const graph = new DependencyGraph([a, b], new Set());
    expect(graph.detectCycles().size).toBe(0);
  });

  it("topologicalOrder respeta que un consumidor se construya después de su proveedor", () => {
    const provider = makeManifest({
      id: "provider",
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
    });
    const consumer = makeManifest({
      id: "consumer",
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const graph = new DependencyGraph([provider, consumer], new Set());
    const order = graph.topologicalOrder(new Set());
    expect(order.indexOf("provider")).toBeLessThan(order.indexOf("consumer"));
  });

  it("topologicalOrder excluye los ids indicados", () => {
    const provider = makeManifest({
      id: "provider",
      providedCapabilities: [{ name: "cap.a", version: "1.0.0" }],
    });
    const consumer = makeManifest({
      id: "consumer",
      requiredCapabilities: [{ name: "cap.a", version: "1.0.0", mandatory: true }],
    });
    const graph = new DependencyGraph([provider, consumer], new Set());
    const order = graph.topologicalOrder(new Set(["consumer"]));
    expect(order).toEqual(["provider"]);
  });
});
