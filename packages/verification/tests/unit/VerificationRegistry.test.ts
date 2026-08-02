import { describe, it, expect } from "vitest";
import { VerificationRegistry } from "../../src/VerificationRegistry.js";
import { VerificationErrorCode } from "../../src/errors/VerificationErrorCode.js";

describe("VerificationRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new VerificationRegistry();
    registry.register("b", {}, ["projects"]);
    registry.register("a", {}, ["projects"]);
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    expect(() => registry.register("v1", {}, ["projects"])).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_OPERATION_CONFLICT })
    );
  });

  it("require()/toDescriptor() lanzan VERIFICATION_NOT_FOUND si no existe", () => {
    const registry = new VerificationRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_NOT_FOUND })
    );
    expect(() => registry.toDescriptor("no-existe")).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_NOT_FOUND })
    );
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    registry.unregister("v1");
    expect(registry.list()).toEqual([]);
    registry.register("v2", {}, ["projects"]);
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("VerificationRegistry — estado y resúmenes", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    registry.setState("v1", "running");
    expect(registry.get("v1")?.state).toBe("running");
    expect(() => registry.setState("v1", "pending")).toThrow(
      expect.objectContaining({ code: VerificationErrorCode.VERIFICATION_INVALID_STATE_TRANSITION })
    );
  });

  it("setChecks() calcula el resumen pass/warning/fail", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    registry.setChecks("v1", [
      { category: "projects", checkId: "c1", status: "pass", message: "ok" },
      { category: "projects", checkId: "c2", status: "warning", message: "aviso" },
      { category: "projects", checkId: "c3", status: "fail", message: "error" },
      { category: "projects", checkId: "c4", status: "pass", message: "ok" },
    ]);
    expect(registry.get("v1")?.summary).toEqual({ pass: 2, warning: 1, fail: 1 });
  });

  it("setCompletedAt() actualiza el registro", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    registry.setCompletedAt("v1", "2026-01-01T00:00:00.000Z");
    expect(registry.get("v1")?.completedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("toDescriptor() incluye completedAt solo si está definido", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    expect(registry.toDescriptor("v1").completedAt).toBeUndefined();
  });
});

describe("VerificationRegistry — filtrado", () => {
  it("filter() combina estado y categoría", () => {
    const registry = new VerificationRegistry();
    registry.register("v1", {}, ["projects"]);
    registry.register("v2", {}, ["backups"]);
    registry.setState("v2", "running");

    expect(registry.filter({ category: "backups" })).toEqual(["v2"]);
    expect(registry.filter({ state: "running" })).toEqual(["v2"]);
    expect(registry.filter({ category: "projects", state: "pending" })).toEqual(["v1"]);
  });
});
