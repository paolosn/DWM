import { describe, expect, it } from "vitest";
import {
  asRecord,
  assertSafeOptionalPath,
  optionalBoolean,
  optionalString,
  optionalStringArray,
  requireRecord,
  requireString,
} from "../../src/payloadHelpers.js";
import { ApplicationError } from "../../src/errors/ApplicationError.js";

describe("payloadHelpers", () => {
  it("asRecord acepta objetos planos y rechaza el resto", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(() => asRecord(null)).toThrow(ApplicationError);
    expect(() => asRecord([1, 2])).toThrow(ApplicationError);
    expect(() => asRecord("string")).toThrow(ApplicationError);
  });

  it("requireString exige una cadena no vacía", () => {
    expect(requireString({ id: "abc" }, "id")).toBe("abc");
    expect(() => requireString({ id: "" }, "id")).toThrow(ApplicationError);
    expect(() => requireString({}, "id")).toThrow(ApplicationError);
    expect(() => requireString({ id: 42 }, "id")).toThrow(ApplicationError);
  });

  it("optionalString admite ausencia y rechaza tipos incorrectos", () => {
    expect(optionalString({}, "root")).toBeUndefined();
    expect(optionalString({ root: "/a" }, "root")).toBe("/a");
    expect(() => optionalString({ root: 5 }, "root")).toThrow(ApplicationError);
  });

  it("optionalBoolean admite ausencia y rechaza tipos incorrectos", () => {
    expect(optionalBoolean({}, "force")).toBeUndefined();
    expect(optionalBoolean({ force: true }, "force")).toBe(true);
    expect(() => optionalBoolean({ force: "true" }, "force")).toThrow(ApplicationError);
  });

  it("requireRecord exige un objeto", () => {
    expect(requireRecord({ data: { a: 1 } }, "data")).toEqual({ a: 1 });
    expect(() => requireRecord({}, "data")).toThrow(ApplicationError);
    expect(() => requireRecord({ data: [1] }, "data")).toThrow(ApplicationError);
    expect(() => requireRecord({ data: "no" }, "data")).toThrow(ApplicationError);
  });

  it("optionalStringArray admite ausencia y valida que todos los elementos sean cadenas", () => {
    expect(optionalStringArray({}, "tags")).toBeUndefined();
    expect(optionalStringArray({ tags: ["a", "b"] }, "tags")).toEqual(["a", "b"]);
    expect(() => optionalStringArray({ tags: [1, 2] }, "tags")).toThrow(ApplicationError);
    expect(() => optionalStringArray({ tags: "no-array" }, "tags")).toThrow(ApplicationError);
  });

  it("assertSafeOptionalPath delega en el validador de rutas compartido", () => {
    expect(() => assertSafeOptionalPath({ root: "a/../b" }, "root")).toThrow(ApplicationError);
    expect(() => assertSafeOptionalPath({ root: "/abs" }, "root")).toThrow(ApplicationError);
    expect(() =>
      assertSafeOptionalPath({ root: "/abs" }, "root", { allowAbsolute: true })
    ).not.toThrow();
    expect(() => assertSafeOptionalPath({}, "root")).not.toThrow();
  });
});
