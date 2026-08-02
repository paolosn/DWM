import { describe, expect, it } from "vitest";
import { ApplicationRegistry, type ApplicationController } from "../../src/ApplicationRegistry.js";
import { ApplicationOperationRegistry } from "../../src/ApplicationOperationRegistry.js";
import { ApplicationPermissions } from "../../src/ApplicationPermissions.js";

function fakeController(resource: string): ApplicationController {
  return {
    resource,
    register: () => {
      // sin operaciones para esta prueba
    },
  };
}

describe("ApplicationRegistry", () => {
  it("registra controladores y los recupera por recurso", () => {
    const registry = new ApplicationRegistry();
    const controller = fakeController("demo");
    registry.add(controller);
    expect(registry.get("demo")).toBe(controller);
    expect(registry.listResources()).toEqual(["demo"]);
    expect(registry.list()).toEqual([controller]);
  });

  it("lanza si se registra dos veces el mismo recurso", () => {
    const registry = new ApplicationRegistry();
    registry.add(fakeController("demo"));
    expect(() => registry.add(fakeController("demo"))).toThrowError(/Ya existe un controlador/);
  });

  it("get() devuelve undefined para un recurso no registrado", () => {
    const registry = new ApplicationRegistry();
    expect(registry.get("no-existe")).toBeUndefined();
  });

  it("registerAll delega en cada controlador registrado", () => {
    const registry = new ApplicationRegistry();
    const calls: string[] = [];
    registry.add({
      resource: "a",
      register: () => calls.push("a"),
    });
    registry.add({
      resource: "b",
      register: () => calls.push("b"),
    });

    registry.registerAll(new ApplicationOperationRegistry(), new ApplicationPermissions());
    expect(calls.sort()).toEqual(["a", "b"]);
  });
});
