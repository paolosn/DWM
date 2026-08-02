import { describe, it, expect } from "vitest";
import { PSNRegistry } from "../../src/PSNRegistry.js";
import { PSNErrorCode } from "../../src/errors/PSNErrorCode.js";
import type { PSNModel } from "../../src/PSNTypes.js";

function makeModel(root: string): PSNModel {
  return { root, resources: [], unclassified: [], scannedAt: Date.now() };
}

describe("PSNRegistry", () => {
  it("set()/get()/has() almacenan y recuperan modelos por raíz", () => {
    const registry = new PSNRegistry();
    expect(registry.has("/a")).toBe(false);
    registry.set("/a", makeModel("/a"));
    expect(registry.has("/a")).toBe(true);
    expect(registry.get("/a")?.root).toBe("/a");
    expect(registry.get("/no-existe")).toBeUndefined();
  });

  it("set() marca la raíz como activa", () => {
    const registry = new PSNRegistry();
    registry.set("/a", makeModel("/a"));
    expect(registry.getActiveRoot()).toBe("/a");
    registry.set("/b", makeModel("/b"));
    expect(registry.getActiveRoot()).toBe("/b");
  });

  it("require() lanza PSN_MODEL_NOT_FOUND si no existe", () => {
    const registry = new PSNRegistry();
    expect(() => registry.require("/no-existe")).toThrowError(
      expect.objectContaining({ code: PSNErrorCode.PSN_MODEL_NOT_FOUND })
    );
  });

  it("setActiveRoot() cambia la raíz activa y lanza si no existe", () => {
    const registry = new PSNRegistry();
    registry.set("/a", makeModel("/a"));
    registry.set("/b", makeModel("/b"));
    registry.setActiveRoot("/a");
    expect(registry.getActiveRoot()).toBe("/a");
    expect(() => registry.setActiveRoot("/no-existe")).toThrowError(
      expect.objectContaining({ code: PSNErrorCode.PSN_MODEL_NOT_FOUND })
    );
  });

  it("listRoots() devuelve las raíces ordenadas", () => {
    const registry = new PSNRegistry();
    registry.set("/b", makeModel("/b"));
    registry.set("/a", makeModel("/a"));
    expect(registry.listRoots()).toEqual(["/a", "/b"]);
  });

  it("delete() elimina un modelo y limpia la raíz activa si coincide", () => {
    const registry = new PSNRegistry();
    registry.set("/a", makeModel("/a"));
    registry.delete("/a");
    expect(registry.has("/a")).toBe(false);
    expect(registry.getActiveRoot()).toBeUndefined();
  });

  it("delete() no toca la raíz activa si no coincide", () => {
    const registry = new PSNRegistry();
    registry.set("/a", makeModel("/a"));
    registry.set("/b", makeModel("/b"));
    registry.delete("/a");
    expect(registry.getActiveRoot()).toBe("/b");
  });

  it("clear() elimina todos los modelos y la raíz activa", () => {
    const registry = new PSNRegistry();
    registry.set("/a", makeModel("/a"));
    registry.set("/b", makeModel("/b"));
    registry.clear();
    expect(registry.listRoots()).toEqual([]);
    expect(registry.getActiveRoot()).toBeUndefined();
  });
});
