import { describe, it, expect } from "vitest";
import { BackupRegistry } from "../../src/BackupRegistry.js";
import { BACKUP_FORMAT_VERSION, type BackupManifest } from "../../src/BackupManifest.js";
import { BackupErrorCode } from "../../src/errors/BackupErrorCode.js";

function makeManifest(overrides: Partial<BackupManifest> = {}): BackupManifest {
  return {
    id: "b1",
    type: "full",
    createdAt: new Date().toISOString(),
    includedResources: [{ resourceType: "project", resourceId: "p1" }],
    excludedPaths: [],
    target: { providerId: "local", path: "dest" },
    providerId: "local",
    formatVersion: BACKUP_FORMAT_VERSION,
    ...overrides,
  };
}

describe("BackupRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b" }));
    registry.register(makeManifest({ id: "a" }));
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b1" }));
    expect(() => registry.register(makeManifest({ id: "b1" }))).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_OPERATION_CONFLICT })
    );
  });

  it("require()/toDescriptor() lanzan BACKUP_NOT_FOUND si no existe", () => {
    const registry = new BackupRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_NOT_FOUND })
    );
    expect(() => registry.toDescriptor("no-existe")).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_NOT_FOUND })
    );
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b1" }));
    registry.unregister("b1");
    expect(registry.list()).toEqual([]);
    registry.register(makeManifest({ id: "b2" }));
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});

describe("BackupRegistry — estado, progreso y diagnósticos", () => {
  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b1" }));
    registry.setState("b1", "preparing");
    expect(registry.get("b1")?.state).toBe("preparing");
    expect(() => registry.setState("b1", "completed")).toThrow(
      expect.objectContaining({ code: BackupErrorCode.BACKUP_INVALID_STATE_TRANSITION })
    );
  });

  it("setProgress/addWarning/addError/replaceManifest/setPolicy actualizan el registro", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b1" }));
    registry.setProgress("b1", {
      phase: "copying",
      itemsProcessed: 1,
      bytesProcessed: 10,
      updatedAt: new Date().toISOString(),
    });
    registry.addWarning("b1", { code: "X", message: "aviso" });
    registry.addError("b1", { code: "Y", message: "error" });
    registry.replaceManifest("b1", makeManifest({ id: "b1", sizeBytes: 100 }));
    registry.setPolicy("b1", { protected: true, tags: ["importante"] });

    const record = registry.get("b1")!;
    expect(record.progress?.itemsProcessed).toBe(1);
    expect(record.warnings).toHaveLength(1);
    expect(record.errors).toHaveLength(1);
    expect(record.manifest.sizeBytes).toBe(100);
    expect(record.policy.protected).toBe(true);
  });

  it("toDescriptor() incluye progress solo si está definido", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "b1" }));
    expect(registry.toDescriptor("b1").progress).toBeUndefined();
  });
});

describe("BackupRegistry — filtrado", () => {
  it("filter() combina tipo, estado, recurso y fechas", () => {
    const registry = new BackupRegistry();
    registry.register(
      makeManifest({ id: "b1", type: "full", createdAt: "2026-01-01T00:00:00.000Z" }),
      "completed"
    );
    registry.register(
      makeManifest({
        id: "b2",
        type: "selective",
        includedResources: [{ resourceType: "workspace", resourceId: "w1" }],
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
      "failed"
    );

    expect(registry.filter({ type: "full" })).toEqual(["b1"]);
    expect(registry.filter({ state: "failed" })).toEqual(["b2"]);
    expect(registry.filter({ resourceType: "workspace" })).toEqual(["b2"]);
    expect(registry.filter({ resourceId: "p1" })).toEqual(["b1"]);
    expect(registry.filter({ createdAfter: "2026-01-15T00:00:00.000Z" })).toEqual(["b2"]);
    expect(registry.filter({ createdBefore: "2026-01-15T00:00:00.000Z" })).toEqual(["b1"]);
  });
});

describe("BackupRegistry — dependientes incrementales", () => {
  it("getDependentIncrementals() encuentra backups incrementales no eliminados con ese backup base", () => {
    const registry = new BackupRegistry();
    registry.register(makeManifest({ id: "base" }), "completed");
    registry.register(
      makeManifest({ id: "inc1", type: "incremental", baseBackupId: "base" }),
      "completed"
    );
    expect(registry.getDependentIncrementals("base")).toEqual(["inc1"]);

    registry.setState("inc1", "deleting");
    registry.setState("inc1", "deleted");
    expect(registry.getDependentIncrementals("base")).toEqual([]);
  });
});
