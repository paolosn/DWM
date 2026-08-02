import { describe, it, expect } from "vitest";
import { WorkspaceRegistry } from "../../src/WorkspaceRegistry.js";
import { createInitialWorkspaceMetadata } from "../../src/WorkspaceMetadata.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";

describe("WorkspaceRegistry", () => {
  it("registra y consulta; list() ordena alfabéticamente por id", () => {
    const registry = new WorkspaceRegistry();
    const m1 = createInitialWorkspaceMetadata();
    const m2 = createInitialWorkspaceMetadata();
    registry.register(m1, "/root1");
    registry.register(m2, "/root2");
    expect(registry.list().sort()).toEqual([m1.id, m2.id].sort());
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new WorkspaceRegistry();
    const metadata = createInitialWorkspaceMetadata();
    registry.register(metadata, "/root1");
    expect(() => registry.register(metadata, "/root2")).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.PWORKSPACE_ALREADY_REGISTERED })
    );
  });

  it("require()/get()/has() reflejan el registro", () => {
    const registry = new WorkspaceRegistry();
    const metadata = createInitialWorkspaceMetadata();
    registry.register(metadata, "/root1");

    expect(registry.has(metadata.id)).toBe(true);
    expect(registry.get(metadata.id)?.root).toBe("/root1");
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.PWORKSPACE_NOT_FOUND })
    );
  });

  it("setActive()/getActive() marcan y devuelven el Workspace activo", () => {
    const registry = new WorkspaceRegistry();
    const metadata = createInitialWorkspaceMetadata();
    registry.register(metadata, "/root1");

    expect(registry.getActive()).toBeUndefined();
    registry.setActive(metadata.id);
    expect(registry.getActive()?.root).toBe("/root1");
  });

  it("setActive() lanza si el id no existe", () => {
    const registry = new WorkspaceRegistry();
    expect(() => registry.setActive("no-existe")).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.PWORKSPACE_NOT_FOUND })
    );
  });

  it("unregister() limpia también la marca de activo si corresponde", () => {
    const registry = new WorkspaceRegistry();
    const metadata = createInitialWorkspaceMetadata();
    registry.register(metadata, "/root1");
    registry.setActive(metadata.id);

    registry.unregister(metadata.id);
    expect(registry.getActive()).toBeUndefined();
    expect(registry.has(metadata.id)).toBe(false);
  });

  it("clear() elimina todo, incluida la marca de activo", () => {
    const registry = new WorkspaceRegistry();
    const metadata = createInitialWorkspaceMetadata();
    registry.register(metadata, "/root1");
    registry.setActive(metadata.id);

    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.getActive()).toBeUndefined();
  });
});
