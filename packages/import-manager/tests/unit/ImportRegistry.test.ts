import { describe, it, expect } from "vitest";
import { ImportRegistry } from "../../src/ImportRegistry.js";
import { ImportErrorCode } from "../../src/errors/ImportErrorCode.js";

function makeRequest() {
  return { sourceType: "folder" as const, sourcePath: "/tmp/origen" };
}

describe("ImportRegistry", () => {
  it("register()/require() crean y recuperan un registro en estado pending", () => {
    const registry = new ImportRegistry();
    registry.register("i1", makeRequest());
    const record = registry.require("i1");
    expect(record.state).toBe("pending");
    expect(record.filesImported).toBe(0);
    expect(record.directoriesImported).toBe(0);
    expect(registry.has("i1")).toBe(true);
    expect(registry.get("no-existe")).toBeUndefined();
  });

  it("register() lanza IMPORT_OPERATION_CONFLICT si el id ya existe", () => {
    const registry = new ImportRegistry();
    registry.register("i1", makeRequest());
    expect(() => registry.register("i1", makeRequest())).toThrowError(
      expect.objectContaining({ code: ImportErrorCode.IMPORT_OPERATION_CONFLICT })
    );
  });

  it("require() lanza IMPORT_NOT_FOUND si no existe", () => {
    const registry = new ImportRegistry();
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: ImportErrorCode.IMPORT_NOT_FOUND })
    );
  });

  it("list() devuelve los ids ordenados", () => {
    const registry = new ImportRegistry();
    registry.register("b", makeRequest());
    registry.register("a", makeRequest());
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("filter() filtra por sourceType y por state", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.register("b", { sourceType: "zip", sourcePath: "/tmp/x.zip" });
    registry.setState("a", "scanning");

    expect(registry.filter({ sourceType: "zip" })).toEqual(["b"]);
    expect(registry.filter({ state: "scanning" })).toEqual(["a"]);
    expect(registry.filter({})).toEqual(["a", "b"]);
  });

  it("setState() respeta las transiciones permitidas y rechaza las inválidas", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.setState("a", "scanning");
    expect(registry.require("a").state).toBe("scanning");
    expect(() => registry.setState("a", "completed")).toThrowError(
      expect.objectContaining({ code: ImportErrorCode.IMPORT_INVALID_STATE_TRANSITION })
    );
  });

  it("setProgress/setFilesImported/setDirectoriesImported/setDestinationPath actualizan el registro", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.setFilesImported("a", 3);
    registry.setDirectoriesImported("a", 2);
    registry.setDestinationPath("a", "/tmp/destino");
    registry.setProgress("a", {
      phase: "copying",
      itemsProcessed: 3,
      updatedAt: new Date().toISOString(),
    });
    const record = registry.require("a");
    expect(record.filesImported).toBe(3);
    expect(record.directoriesImported).toBe(2);
    expect(record.destinationPath).toBe("/tmp/destino");
    expect(record.progress?.phase).toBe("copying");
  });

  it("setStartedAt/setCompletedAt registran las marcas de tiempo", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.setStartedAt("a", "t0");
    registry.setCompletedAt("a", "t1");
    const record = registry.require("a");
    expect(record.startedAt).toBe("t0");
    expect(record.completedAt).toBe("t1");
  });

  it("addWarning/addError acumulan issues", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.addWarning("a", { code: "W", message: "aviso" });
    registry.addError("a", { code: "E", message: "error" });
    const record = registry.require("a");
    expect(record.warnings).toHaveLength(1);
    expect(record.errors).toHaveLength(1);
  });

  it("toDescriptor() incluye solo los campos opcionales presentes", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    const bare = registry.toDescriptor("a");
    expect(bare.startedAt).toBeUndefined();
    expect(bare.destinationPath).toBeUndefined();

    registry.setStartedAt("a", "t0");
    registry.setCompletedAt("a", "t1");
    registry.setDestinationPath("a", "/tmp/destino");
    registry.setProgress("a", {
      phase: "copying",
      itemsProcessed: 1,
      updatedAt: new Date().toISOString(),
    });
    const full = registry.toDescriptor("a");
    expect(full.startedAt).toBe("t0");
    expect(full.completedAt).toBe("t1");
    expect(full.destinationPath).toBe("/tmp/destino");
    expect(full.progress?.phase).toBe("copying");
  });

  it("unregister()/clear() eliminan registros", () => {
    const registry = new ImportRegistry();
    registry.register("a", makeRequest());
    registry.unregister("a");
    expect(registry.has("a")).toBe(false);

    registry.register("b", makeRequest());
    registry.register("c", makeRequest());
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
