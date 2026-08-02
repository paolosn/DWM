import { describe, it, expect } from "vitest";
import { ProjectRegistry } from "../../src/ProjectRegistry.js";
import { Project } from "../../src/Project.js";
import { createInitialProjectMetadata } from "../../src/ProjectMetadata.js";
import { ProjectErrorCode } from "../../src/errors/ProjectErrorCode.js";

function makeProject(id: string): Project {
  return new Project(createInitialProjectMetadata(id, `Proyecto ${id}`, "desc"), {
    projectPath: `/tmp/${id}`,
    profileId: "p1",
    usedTools: [],
    usedAdapters: [],
  });
}

describe("ProjectRegistry", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("b"));
    registry.register(makeProject("a"));
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("a"));
    expect(() => registry.register(makeProject("a"))).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_ALREADY_EXISTS })
    );
  });

  it("require() lanza PROJECT_NOT_FOUND si no existe", () => {
    const registry = new ProjectRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_NOT_FOUND })
    );
  });

  it("setState() aplica transiciones válidas y rechaza las inválidas", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("a"));
    registry.setState("a", "open");
    expect(registry.get("a")?.state).toBe("open");
    expect(() => registry.setState("a", "created")).toThrow(
      expect.objectContaining({ code: ProjectErrorCode.PROJECT_INVALID_STATE_TRANSITION })
    );
  });

  it("setState('open') fija el proyecto activo; cerrarlo lo limpia", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("a"));
    registry.setState("a", "open");
    expect(registry.getActiveId()).toBe("a");
    expect(registry.getActive()?.id).toBe("a");

    registry.setState("a", "closed");
    expect(registry.getActiveId()).toBeNull();
    expect(registry.getActive()).toBeUndefined();
  });

  it("unregister() elimina del registro y limpia el activo si era ese", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("a"));
    registry.setState("a", "open");
    registry.unregister("a");
    expect(registry.list()).toEqual([]);
    expect(registry.getActiveId()).toBeNull();
  });

  it("clear() vacía el registro y el activo", () => {
    const registry = new ProjectRegistry();
    registry.register(makeProject("a"));
    registry.setState("a", "open");
    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.getActiveId()).toBeNull();
  });
});
