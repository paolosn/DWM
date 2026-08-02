import { describe, it, expect } from "vitest";
import { MigrationRegistry } from "../../src/MigrationRegistry.js";
import { MigrationErrorCode } from "../../src/errors/MigrationErrorCode.js";

describe("MigrationRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new MigrationRegistry();
    registry.register("b", "export", {
      type: "full",
      resources: [],
      target: { providerId: "local", path: "d" },
    });
    registry.register("a", "import", { backupId: "x" });
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "import", { backupId: "x" });
    expect(() => registry.register("m1", "import", { backupId: "x" })).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_OPERATION_CONFLICT })
    );
  });

  it("require()/toDescriptor() lanzan MIGRATION_NOT_FOUND si no existe", () => {
    const registry = new MigrationRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_NOT_FOUND })
    );
    expect(() => registry.toDescriptor("no-existe")).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_NOT_FOUND })
    );
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "import", { backupId: "x" });
    registry.unregister("m1");
    expect(registry.list()).toEqual([]);
    registry.register("m2", "import", { backupId: "x" });
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("MigrationRegistry — estado y enlaces", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "import", { backupId: "x" });
    registry.setState("m1", "preparing");
    expect(registry.get("m1")?.state).toBe("preparing");
    expect(() => registry.setState("m1", "completed")).toThrow(
      expect.objectContaining({ code: MigrationErrorCode.MIGRATION_INVALID_STATE_TRANSITION })
    );
  });

  it("setBackupId/setRestoreId/setSourceDwmVersion/setCompletedAt/addWarning/addError actualizan el registro", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "export", {
      type: "full",
      resources: [],
      target: { providerId: "local", path: "d" },
    });
    registry.setBackupId("m1", "b1");
    registry.setRestoreId("m1", "r1");
    registry.setSourceDwmVersion("m1", "1.0.0");
    registry.setCompletedAt("m1", "2026-01-01T00:00:00.000Z");
    registry.addWarning("m1", { code: "X", message: "aviso" });
    registry.addError("m1", { code: "Y", message: "error" });

    const record = registry.get("m1")!;
    expect(record.backupId).toBe("b1");
    expect(record.restoreId).toBe("r1");
    expect(record.sourceDwmVersion).toBe("1.0.0");
    expect(record.completedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.warnings).toHaveLength(1);
    expect(record.errors).toHaveLength(1);
  });

  it("toDescriptor() incluye campos opcionales solo si están definidos", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "import", { backupId: "x" });
    const descriptor = registry.toDescriptor("m1");
    expect(descriptor.completedAt).toBeUndefined();
    expect(descriptor.backupId).toBeUndefined();
    expect(descriptor.restoreId).toBeUndefined();
    expect(descriptor.sourceDwmVersion).toBeUndefined();
  });
});

describe("MigrationRegistry — filtrado", () => {
  it("filter() combina dirección y estado", () => {
    const registry = new MigrationRegistry();
    registry.register("m1", "export", {
      type: "full",
      resources: [],
      target: { providerId: "local", path: "d" },
    });
    registry.register("m2", "import", { backupId: "x" });
    registry.setState("m2", "preparing");

    expect(registry.filter({ direction: "export" })).toEqual(["m1"]);
    expect(registry.filter({ state: "preparing" })).toEqual(["m2"]);
  });
});
