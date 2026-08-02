import { describe, it, expect } from "vitest";
import { RuleRegistry } from "../../src/RuleRegistry.js";
import { RuleErrorCode } from "../../src/errors/RuleErrorCode.js";
import type { RuleSummary } from "../../src/RuleTypes.js";

function summary(overrides: Partial<RuleSummary> = {}): RuleSummary {
  return {
    id: "regla-1",
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RuleRegistry", () => {
  it("set()/get()/has() gestionan entradas individuales", () => {
    const registry = new RuleRegistry();
    expect(registry.has("regla-1")).toBe(false);
    registry.set(summary());
    expect(registry.has("regla-1")).toBe(true);
    expect(registry.get("regla-1")).toEqual(summary());
  });

  it("require() lanza RULE_NOT_FOUND si no está indexada", () => {
    const registry = new RuleRegistry();
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: RuleErrorCode.RULE_NOT_FOUND })
    );
  });

  it("require() devuelve la entrada si está indexada", () => {
    const registry = new RuleRegistry();
    registry.set(summary());
    expect(registry.require("regla-1")).toEqual(summary());
  });

  it("delete() elimina una entrada", () => {
    const registry = new RuleRegistry();
    registry.set(summary());
    registry.delete("regla-1");
    expect(registry.has("regla-1")).toBe(false);
  });

  it("replaceAll() sustituye por completo el contenido del índice", () => {
    const registry = new RuleRegistry();
    registry.set(summary({ id: "vieja" }));
    registry.replaceAll([summary({ id: "nueva" })]);
    expect(registry.has("vieja")).toBe(false);
    expect(registry.has("nueva")).toBe(true);
  });

  it("list() devuelve las entradas ordenadas por id", () => {
    const registry = new RuleRegistry();
    registry.set(summary({ id: "b" }));
    registry.set(summary({ id: "a" }));
    expect(registry.list().map((s) => s.id)).toEqual(["a", "b"]);
  });

  describe("filter()", () => {
    it("filtra por archived", () => {
      const registry = new RuleRegistry();
      registry.set(summary({ id: "a", archived: true }));
      registry.set(summary({ id: "b", archived: false }));
      expect(registry.filter({ archived: true }).map((s) => s.id)).toEqual(["a"]);
    });

    it("sin criterios, devuelve todo", () => {
      const registry = new RuleRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.filter({}).map((s) => s.id)).toEqual(["a"]);
    });
  });

  describe("search()", () => {
    it("busca por id y título sin distinguir mayúsculas", () => {
      const registry = new RuleRegistry();
      registry.set(summary({ id: "regla-soporte", title: "Soporte Nivel 1" }));
      registry.set(summary({ id: "regla-ventas", title: "Otro" }));

      expect(registry.search("SOPORTE").map((s) => s.id)).toEqual(["regla-soporte"]);
      expect(registry.search("no-coincide")).toEqual([]);
    });

    it("con cadena vacía devuelve todo", () => {
      const registry = new RuleRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.search("   ").map((s) => s.id)).toEqual(["a"]);
    });

    it("no falla si una entrada no tiene título", () => {
      const registry = new RuleRegistry();
      registry.set(summary({ id: "sin-titulo" }));
      expect(registry.search("cualquier-cosa")).toEqual([]);
    });
  });

  it("clear() vacía el índice", () => {
    const registry = new RuleRegistry();
    registry.set(summary());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
