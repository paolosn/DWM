import { describe, it, expect } from "vitest";
import {
  isValidSemver,
  isContractCompatible,
  assertValidSemver,
  assertValidModuleIdentity,
  assertValidAdapterIdentity,
} from "../src/registry/validation.js";
import { DWMError } from "../src/errors/DWMError.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";

describe("isValidSemver", () => {
  it("acepta versiones semánticas correctas", () => {
    expect(isValidSemver("1.0.0")).toBe(true);
    expect(isValidSemver("0.1.0")).toBe(true);
    expect(isValidSemver("10.20.30")).toBe(true);
    expect(isValidSemver("1.0.0-alpha")).toBe(true);
    expect(isValidSemver("1.0.0-alpha.1")).toBe(true);
    expect(isValidSemver("1.0.0+build.5")).toBe(true);
  });

  it("rechaza versiones no semánticas", () => {
    expect(isValidSemver("1.0")).toBe(false);
    expect(isValidSemver("1")).toBe(false);
    expect(isValidSemver("v1.0.0")).toBe(false);
    expect(isValidSemver("1.0.0.0")).toBe(false);
    expect(isValidSemver("no-es-semver")).toBe(false);
    expect(isValidSemver("")).toBe(false);
  });
});

describe("isContractCompatible", () => {
  it("es compatible cuando la versión MAYOR coincide", () => {
    expect(isContractCompatible("1.0.0", "1.4.2")).toBe(true);
    expect(isContractCompatible("2.3.0", "2.0.0")).toBe(true);
  });

  it("es incompatible cuando la versión MAYOR difiere", () => {
    expect(isContractCompatible("1.0.0", "2.0.0")).toBe(false);
    expect(isContractCompatible("2.0.0", "1.9.9")).toBe(false);
  });
});

describe("assertValidSemver", () => {
  it("no lanza para una versión válida", () => {
    expect(() => assertValidSemver("1.0.0", "version", "registry-module")).not.toThrow();
  });

  it("lanza DWMError con INVALID_SEMANTIC_VERSION para una versión inválida", () => {
    expect(() => assertValidSemver("1.0", "version", "registry-module")).toThrow(DWMError);
    try {
      assertValidSemver("1.0", "version", "registry-module");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DWMError);
      expect((err as DWMError).code).toBe(ErrorCode.INVALID_SEMANTIC_VERSION);
    }
  });
});

describe("assertValidModuleIdentity", () => {
  it("acepta una identidad completa y válida", () => {
    expect(() =>
      assertValidModuleIdentity({ id: "mod.ok", version: "1.0.0", contractVersion: "1.0.0" })
    ).not.toThrow();
  });

  it("rechaza id vacío, con espacios, o versión/contractVersion ausentes", () => {
    expect(() =>
      assertValidModuleIdentity({ id: "", version: "1.0.0", contractVersion: "1.0.0" })
    ).toThrow(expect.objectContaining({ code: ErrorCode.MODULE_INVALID_IDENTITY }));
    expect(() =>
      assertValidModuleIdentity({ id: " mod ", version: "1.0.0", contractVersion: "1.0.0" })
    ).toThrow(expect.objectContaining({ code: ErrorCode.MODULE_INVALID_IDENTITY }));
    expect(() =>
      assertValidModuleIdentity({ id: "mod.x", version: "", contractVersion: "1.0.0" })
    ).toThrow(expect.objectContaining({ code: ErrorCode.MODULE_INVALID_IDENTITY }));
    expect(() =>
      assertValidModuleIdentity({ id: "mod.x", version: "1.0.0", contractVersion: "" })
    ).toThrow(expect.objectContaining({ code: ErrorCode.MODULE_INVALID_IDENTITY }));
  });
});

describe("assertValidAdapterIdentity", () => {
  it("acepta una identidad completa y válida", () => {
    expect(() =>
      assertValidAdapterIdentity({
        id: "adp.ok",
        subjectId: "s1",
        version: "1.0.0",
        contractVersion: "1.0.0",
      })
    ).not.toThrow();
  });

  it("rechaza subjectId ausente o vacío", () => {
    expect(() =>
      assertValidAdapterIdentity({
        id: "adp.x",
        subjectId: "",
        version: "1.0.0",
        contractVersion: "1.0.0",
      })
    ).toThrow(expect.objectContaining({ code: ErrorCode.ADAPTER_INVALID_IDENTITY }));
  });
});
