import { describe, it, expect } from "vitest";
import { RestoreRegistry } from "../../src/RestoreRegistry.js";
import { RestoreErrorCode } from "../../src/errors/RestoreErrorCode.js";

describe("RestoreRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new RestoreRegistry();
    registry.register("b", { backupId: "x" });
    registry.register("a", { backupId: "x" });
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "x" });
    expect(() => registry.register("r1", { backupId: "x" })).toThrow(
      expect.objectContaining({ code: RestoreErrorCode.RESTORE_OPERATION_CONFLICT })
    );
  });

  it("require()/toDescriptor() lanzan RESTORE_NOT_FOUND si no existe", () => {
    const registry = new RestoreRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: RestoreErrorCode.RESTORE_NOT_FOUND })
    );
    expect(() => registry.toDescriptor("no-existe")).toThrow(
      expect.objectContaining({ code: RestoreErrorCode.RESTORE_NOT_FOUND })
    );
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "x" });
    registry.unregister("r1");
    expect(registry.list()).toEqual([]);
    registry.register("r2", { backupId: "x" });
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("RestoreRegistry — estado, progreso y diagnósticos", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "x" });
    registry.setState("r1", "preparing");
    expect(registry.get("r1")?.state).toBe("preparing");
    expect(() => registry.setState("r1", "completed")).toThrow(
      expect.objectContaining({ code: RestoreErrorCode.RESTORE_INVALID_STATE_TRANSITION })
    );
  });

  it("setProgress/setItemsRestored/setStartedAt/setCompletedAt/addWarning/addError actualizan el registro", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "x" });
    registry.setProgress("r1", {
      phase: "restoring",
      itemsProcessed: 1,
      updatedAt: new Date().toISOString(),
    });
    registry.setItemsRestored("r1", 2);
    registry.setStartedAt("r1", "2026-01-01T00:00:00.000Z");
    registry.setCompletedAt("r1", "2026-01-01T00:01:00.000Z");
    registry.addWarning("r1", { code: "X", message: "aviso" });
    registry.addError("r1", { code: "Y", message: "error" });

    const record = registry.get("r1")!;
    expect(record.progress?.itemsProcessed).toBe(1);
    expect(record.itemsRestored).toBe(2);
    expect(record.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.completedAt).toBe("2026-01-01T00:01:00.000Z");
    expect(record.warnings).toHaveLength(1);
    expect(record.errors).toHaveLength(1);
  });

  it("toDescriptor() incluye startedAt/completedAt/progress solo si están definidos", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "x" });
    const descriptor = registry.toDescriptor("r1");
    expect(descriptor.startedAt).toBeUndefined();
    expect(descriptor.completedAt).toBeUndefined();
    expect(descriptor.progress).toBeUndefined();
  });
});

describe("RestoreRegistry — filtrado", () => {
  it("filter() combina backupId y estado", () => {
    const registry = new RestoreRegistry();
    registry.register("r1", { backupId: "b1" });
    registry.register("r2", { backupId: "b2" });
    registry.setState("r2", "preparing");

    expect(registry.filter({ backupId: "b1" })).toEqual(["r1"]);
    expect(registry.filter({ state: "preparing" })).toEqual(["r2"]);
  });
});
