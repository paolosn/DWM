import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../../src/SkillRegistry.js";
import { SkillErrorCode } from "../../src/errors/SkillErrorCode.js";
import type { SkillSummary } from "../../src/SkillTypes.js";

function summary(overrides: Partial<SkillSummary> = {}): SkillSummary {
  return {
    id: "skill-1",
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    hasSkillFile: true,
    ...overrides,
  };
}

describe("SkillRegistry", () => {
  it("set()/get()/has() gestionan entradas individuales", () => {
    const registry = new SkillRegistry();
    expect(registry.has("skill-1")).toBe(false);
    registry.set(summary());
    expect(registry.has("skill-1")).toBe(true);
    expect(registry.get("skill-1")).toEqual(summary());
  });

  it("require() lanza SKILL_NOT_FOUND si no está indexada", () => {
    const registry = new SkillRegistry();
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: SkillErrorCode.SKILL_NOT_FOUND })
    );
  });

  it("require() devuelve la entrada si está indexada", () => {
    const registry = new SkillRegistry();
    registry.set(summary());
    expect(registry.require("skill-1")).toEqual(summary());
  });

  it("delete() elimina una entrada", () => {
    const registry = new SkillRegistry();
    registry.set(summary());
    registry.delete("skill-1");
    expect(registry.has("skill-1")).toBe(false);
  });

  it("replaceAll() sustituye por completo el contenido del índice", () => {
    const registry = new SkillRegistry();
    registry.set(summary({ id: "viejo" }));
    registry.replaceAll([summary({ id: "nuevo" })]);
    expect(registry.has("viejo")).toBe(false);
    expect(registry.has("nuevo")).toBe(true);
  });

  it("list() devuelve las entradas ordenadas por id", () => {
    const registry = new SkillRegistry();
    registry.set(summary({ id: "b" }));
    registry.set(summary({ id: "a" }));
    expect(registry.list().map((s) => s.id)).toEqual(["a", "b"]);
  });

  describe("filter()", () => {
    it("filtra por archived", () => {
      const registry = new SkillRegistry();
      registry.set(summary({ id: "a", archived: true }));
      registry.set(summary({ id: "b", archived: false }));
      expect(registry.filter({ archived: true }).map((s) => s.id)).toEqual(["a"]);
    });

    it("sin criterios, devuelve todo", () => {
      const registry = new SkillRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.filter({}).map((s) => s.id)).toEqual(["a"]);
    });
  });

  describe("search()", () => {
    it("busca por id y título sin distinguir mayúsculas", () => {
      const registry = new SkillRegistry();
      registry.set(summary({ id: "skill-soporte", title: "Soporte Nivel 1" }));
      registry.set(summary({ id: "skill-ventas", title: "Otro" }));

      expect(registry.search("SOPORTE").map((s) => s.id)).toEqual(["skill-soporte"]);
      expect(registry.search("no-coincide")).toEqual([]);
    });

    it("con cadena vacía devuelve todo", () => {
      const registry = new SkillRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.search("   ").map((s) => s.id)).toEqual(["a"]);
    });

    it("no falla si una entrada no tiene título", () => {
      const registry = new SkillRegistry();
      const { title: _title, ...withoutTitle } = summary({ id: "sin-titulo" });
      registry.set(withoutTitle);
      expect(registry.search("cualquier-cosa")).toEqual([]);
    });
  });

  it("clear() vacía el índice", () => {
    const registry = new SkillRegistry();
    registry.set(summary());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
