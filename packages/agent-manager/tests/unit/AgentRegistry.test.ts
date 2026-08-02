import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../src/AgentRegistry.js";
import { AgentErrorCode } from "../../src/errors/AgentErrorCode.js";
import type { AgentSummary } from "../../src/AgentTypes.js";

function summary(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: "agente-1",
    archived: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  it("set()/get()/has() gestionan entradas individuales", () => {
    const registry = new AgentRegistry();
    expect(registry.has("agente-1")).toBe(false);
    registry.set(summary());
    expect(registry.has("agente-1")).toBe(true);
    expect(registry.get("agente-1")).toEqual(summary());
  });

  it("require() lanza AGENT_NOT_FOUND si no está indexado", () => {
    const registry = new AgentRegistry();
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: AgentErrorCode.AGENT_NOT_FOUND })
    );
  });

  it("require() devuelve la entrada si está indexada", () => {
    const registry = new AgentRegistry();
    registry.set(summary());
    expect(registry.require("agente-1")).toEqual(summary());
  });

  it("delete() elimina una entrada", () => {
    const registry = new AgentRegistry();
    registry.set(summary());
    registry.delete("agente-1");
    expect(registry.has("agente-1")).toBe(false);
  });

  it("replaceAll() sustituye por completo el contenido del índice", () => {
    const registry = new AgentRegistry();
    registry.set(summary({ id: "viejo" }));
    registry.replaceAll([summary({ id: "nuevo" })]);
    expect(registry.has("viejo")).toBe(false);
    expect(registry.has("nuevo")).toBe(true);
  });

  it("list() devuelve las entradas ordenadas por id", () => {
    const registry = new AgentRegistry();
    registry.set(summary({ id: "b" }));
    registry.set(summary({ id: "a" }));
    expect(registry.list().map((s) => s.id)).toEqual(["a", "b"]);
  });

  describe("filter()", () => {
    it("filtra por archived", () => {
      const registry = new AgentRegistry();
      registry.set(summary({ id: "a", archived: true }));
      registry.set(summary({ id: "b", archived: false }));
      expect(registry.filter({ archived: true }).map((s) => s.id)).toEqual(["a"]);
    });

    it("filtra por tags (deben estar todas presentes)", () => {
      const registry = new AgentRegistry();
      registry.set(summary({ id: "a", tags: ["x", "y"] }));
      registry.set(summary({ id: "b", tags: ["x"] }));
      expect(registry.filter({ tags: ["x", "y"] }).map((s) => s.id)).toEqual(["a"]);
    });

    it("sin criterios, devuelve todo", () => {
      const registry = new AgentRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.filter({}).map((s) => s.id)).toEqual(["a"]);
    });
  });

  describe("search()", () => {
    it("busca por id, nombre y tags sin distinguir mayúsculas", () => {
      const registry = new AgentRegistry();
      registry.set(summary({ id: "agente-soporte", name: "Soporte Nivel 1", tags: ["ventas"] }));
      registry.set(summary({ id: "agente-ventas", name: "Otro", tags: ["Ventas"] }));

      expect(registry.search("SOPORTE").map((s) => s.id)).toEqual(["agente-soporte"]);
      expect(
        registry
          .search("ventas")
          .map((s) => s.id)
          .sort()
      ).toEqual(["agente-soporte", "agente-ventas"]);
      expect(registry.search("no-coincide")).toEqual([]);
    });

    it("con cadena vacía devuelve todo", () => {
      const registry = new AgentRegistry();
      registry.set(summary({ id: "a" }));
      expect(registry.search("   ").map((s) => s.id)).toEqual(["a"]);
    });
  });

  it("clear() vacía el índice", () => {
    const registry = new AgentRegistry();
    registry.set(summary());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
