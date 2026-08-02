import { describe, it, expect } from "vitest";
import { AdapterRegistry } from "../../src/AdapterRegistry.js";
import { defaultAdapterConfiguration } from "../../src/AdapterConfiguration.js";
import { AdapterErrorCode } from "../../src/errors/AdapterErrorCode.js";
import { makeHealth } from "../../src/AdapterHealth.js";
import { FakeAdapter } from "./support/FakeAdapter.js";

function cfg(overrides: Partial<ReturnType<typeof defaultAdapterConfiguration>> = {}) {
  return { ...defaultAdapterConfiguration(), ...overrides };
}

describe("AdapterRegistry — registro básico", () => {
  it("registra y consulta un adaptador; list() los ordena alfabéticamente", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "b" }), cfg());
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    expect(registry.list()).toEqual(["a", "b"]);
    expect(registry.get("a")?.state).toBe("registered");
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    expect(() => registry.register(new FakeAdapter({ id: "a" }), cfg())).toThrow(
      expect.objectContaining({ code: AdapterErrorCode.ADAPTER_ALREADY_REGISTERED })
    );
  });

  it("require() lanza ADAPTER_NOT_FOUND si no existe", () => {
    const registry = new AdapterRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: AdapterErrorCode.ADAPTER_NOT_FOUND })
    );
  });

  it("unregister() elimina el adaptador del registro", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    registry.unregister("a");
    expect(registry.list()).toEqual([]);
  });

  it("clear() vacía el registro", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("AdapterRegistry — estado y salud", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    registry.setState("a", "initialized");
    expect(registry.get("a")?.state).toBe("initialized");
    expect(() => registry.setState("a", "registered")).not.toThrow();
    expect(() => registry.setState("a", "active")).toThrow(); // desde "registered" no se puede ir a "active" directamente
  });

  it("setHealth()/get() reflejan la última salud conocida", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg());
    registry.setHealth("a", makeHealth("a", true));
    expect(registry.get("a")?.health?.healthy).toBe(true);
  });
});

describe("AdapterRegistry — resolveInitOrder", () => {
  it("ignora los adaptadores deshabilitados", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg({ enabled: false }));
    registry.register(new FakeAdapter({ id: "b" }), cfg());
    expect(registry.resolveInitOrder()).toEqual(["b"]);
  });

  it("respeta las dependencias declaradas", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "consumer" }), cfg({ dependencies: ["provider"] }));
    registry.register(new FakeAdapter({ id: "provider" }), cfg());
    expect(registry.resolveInitOrder()).toEqual(["provider", "consumer"]);
  });

  it("desempata por prioridad descendente entre adaptadores independientes", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "baja" }), cfg({ priority: 0 }));
    registry.register(new FakeAdapter({ id: "alta" }), cfg({ priority: 10 }));
    expect(registry.resolveInitOrder()).toEqual(["alta", "baja"]);
  });

  it("lanza ADAPTER_MISSING_DEPENDENCY si la dependencia no está registrada o deshabilitada", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "consumer" }), cfg({ dependencies: ["no-existe"] }));
    expect(() => registry.resolveInitOrder()).toThrow(
      expect.objectContaining({ code: AdapterErrorCode.ADAPTER_MISSING_DEPENDENCY })
    );
  });

  it("lanza ADAPTER_DEPENDENCY_CYCLE ante un ciclo de dependencias", () => {
    const registry = new AdapterRegistry();
    registry.register(new FakeAdapter({ id: "a" }), cfg({ dependencies: ["b"] }));
    registry.register(new FakeAdapter({ id: "b" }), cfg({ dependencies: ["a"] }));
    expect(() => registry.resolveInitOrder()).toThrow(
      expect.objectContaining({ code: AdapterErrorCode.ADAPTER_DEPENDENCY_CYCLE })
    );
  });
});
