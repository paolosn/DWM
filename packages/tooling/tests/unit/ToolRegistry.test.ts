import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/ToolRegistry.js";
import { defaultToolConfiguration } from "../../src/ToolConfiguration.js";
import { ToolErrorCode } from "../../src/errors/ToolErrorCode.js";
import { makeToolHealth } from "../../src/ToolHealth.js";
import type { ToolDescriptor } from "../../src/ToolDescriptor.js";

function descriptor(id: string): ToolDescriptor {
  return { id, name: id, adapterId: id, capabilities: { provided: [], required: [] } };
}
function cfg(overrides: Partial<ReturnType<typeof defaultToolConfiguration>> = {}) {
  return { ...defaultToolConfiguration(), ...overrides };
}

describe("ToolRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("b"), cfg());
    registry.register(descriptor("a"), cfg());
    expect(registry.list()).toEqual(["a", "b"]);
    expect(registry.get("a")?.state).toBe("registered");
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg());
    expect(() => registry.register(descriptor("a"), cfg())).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_ALREADY_REGISTERED })
    );
  });

  it("require() lanza TOOL_NOT_FOUND si no existe", () => {
    const registry = new ToolRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_NOT_FOUND })
    );
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg());
    registry.unregister("a");
    expect(registry.list()).toEqual([]);
    registry.register(descriptor("b"), cfg());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("ToolRegistry — estado, salud y grupos exclusivos", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg());
    registry.setState("a", "initialized");
    expect(registry.get("a")?.state).toBe("initialized");
    expect(() => registry.setState("a", "removed")).not.toThrow();
    expect(() => registry.setState("a", "active")).toThrow();
  });

  it("setHealth() refleja la última salud conocida", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg());
    registry.setHealth("a", makeToolHealth("a", true));
    expect(registry.get("a")?.health?.healthy).toBe(true);
  });

  it("listActive()/getActiveInGroup() reflejan las herramientas activas por grupo", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg({ exclusiveGroup: "editor" }));
    registry.register(descriptor("b"), cfg({ exclusiveGroup: "editor" }));
    registry.setState("a", "initialized");
    registry.setState("a", "active");

    expect(registry.listActive()).toEqual(["a"]);
    expect(registry.getActiveInGroup("editor")).toBe("a");
    expect(registry.getActiveInGroup("otro-grupo")).toBeUndefined();
  });
});

describe("ToolRegistry — resolveInitOrder", () => {
  it("ignora las herramientas deshabilitadas", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg({ enabled: false }));
    registry.register(descriptor("b"), cfg());
    expect(registry.resolveInitOrder()).toEqual(["b"]);
  });

  it("respeta las dependencias declaradas", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("consumer"), cfg({ dependencies: ["provider"] }));
    registry.register(descriptor("provider"), cfg());
    expect(registry.resolveInitOrder()).toEqual(["provider", "consumer"]);
  });

  it("desempata por prioridad descendente entre herramientas independientes", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("baja"), cfg({ priority: 0 }));
    registry.register(descriptor("alta"), cfg({ priority: 10 }));
    expect(registry.resolveInitOrder()).toEqual(["alta", "baja"]);
  });

  it("lanza TOOL_MISSING_DEPENDENCY si la dependencia no está registrada o deshabilitada", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("consumer"), cfg({ dependencies: ["no-existe"] }));
    expect(() => registry.resolveInitOrder()).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_MISSING_DEPENDENCY })
    );
  });

  it("lanza TOOL_DEPENDENCY_CYCLE ante un ciclo de dependencias", () => {
    const registry = new ToolRegistry();
    registry.register(descriptor("a"), cfg({ dependencies: ["b"] }));
    registry.register(descriptor("b"), cfg({ dependencies: ["a"] }));
    expect(() => registry.resolveInitOrder()).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_DEPENDENCY_CYCLE })
    );
  });
});
