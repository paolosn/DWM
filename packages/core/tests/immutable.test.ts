import { describe, it, expect } from "vitest";
import { deepFreezeClone } from "../src/state/immutable.js";

describe("deepFreezeClone", () => {
  it("devuelve valores primitivos y null sin modificarlos", () => {
    expect(deepFreezeClone(42)).toBe(42);
    expect(deepFreezeClone("texto")).toBe("texto");
    expect(deepFreezeClone(null)).toBeNull();
  });

  it("congela objetos y arrays anidados de forma recursiva", () => {
    const clone = deepFreezeClone({ a: 1, nested: { b: [1, 2, { c: 3 }] } });
    expect(Object.isFrozen(clone)).toBe(true);
    expect(Object.isFrozen(clone.nested)).toBe(true);
    expect(Object.isFrozen(clone.nested.b)).toBe(true);
    expect(Object.isFrozen(clone.nested.b[2])).toBe(true);
  });

  it("no afecta al objeto original al mutar el clon (aunque el clon esté congelado)", () => {
    const original = { value: 1 };
    const clone = deepFreezeClone(original);
    expect(clone).not.toBe(original);
    original.value = 2;
    expect(clone.value).toBe(1);
  });
});
