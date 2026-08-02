import { describe, it, expect } from "vitest";
import {
  validateWorkspaceConfiguration,
  defaultWorkspaceConfiguration,
} from "../../src/WorkspaceConfiguration.js";
import { WorkspaceErrorCode } from "../../src/errors/WorkspaceErrorCode.js";
import { WorkspaceRegistry } from "../../src/WorkspaceRegistry.js";
import { Workspace } from "../../src/Workspace.js";
import { createInitialMetadata } from "../../src/WorkspaceMetadata.js";

describe("validateWorkspaceConfiguration", () => {
  it("acepta la configuración por defecto", () => {
    expect(() => validateWorkspaceConfiguration(defaultWorkspaceConfiguration())).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateWorkspaceConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION })
    );
  });

  it("rechaza excludePatterns que no sea un array", () => {
    expect(() =>
      validateWorkspaceConfiguration({
        ...defaultWorkspaceConfiguration(),
        excludePatterns: "x" as never,
      })
    ).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION })
    );
  });

  it("rechaza autoReload no booleano", () => {
    expect(() =>
      validateWorkspaceConfiguration({
        ...defaultWorkspaceConfiguration(),
        autoReload: "si" as never,
      })
    ).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION })
    );
  });

  it("rechaza scanIntervalMs <= 0", () => {
    expect(() =>
      validateWorkspaceConfiguration({ ...defaultWorkspaceConfiguration(), scanIntervalMs: 0 })
    ).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_INVALID_CONFIGURATION })
    );
  });
});

function makeWorkspace(id: string): Workspace {
  return new Workspace(
    createInitialMetadata(id, `Workspace ${id}`, `/tmp/${id}`),
    defaultWorkspaceConfiguration()
  );
}

describe("WorkspaceRegistry", () => {
  it("registra y consulta workspaces por id", () => {
    const registry = new WorkspaceRegistry();
    const ws = makeWorkspace("a");
    registry.register(ws);
    expect(registry.get("a")).toBe(ws);
    expect(registry.list()).toEqual([ws]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new WorkspaceRegistry();
    registry.register(makeWorkspace("a"));
    expect(() => registry.register(makeWorkspace("a"))).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_ALREADY_OPEN })
    );
  });

  it("el primer workspace registrado queda activo por defecto", () => {
    const registry = new WorkspaceRegistry();
    const ws = makeWorkspace("a");
    registry.register(ws);
    expect(registry.getActive()).toBe(ws);
  });

  it("setActive() cambia el workspace activo", () => {
    const registry = new WorkspaceRegistry();
    registry.register(makeWorkspace("a"));
    const b = makeWorkspace("b");
    registry.register(b);
    registry.setActive("b");
    expect(registry.getActive()).toBe(b);
  });

  it("setActive() rechaza un id inexistente", () => {
    const registry = new WorkspaceRegistry();
    expect(() => registry.setActive("no-existe")).toThrow(
      expect.objectContaining({ code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND })
    );
  });

  it("unregister() reasigna el activo a otro workspace restante", () => {
    const registry = new WorkspaceRegistry();
    registry.register(makeWorkspace("a"));
    registry.register(makeWorkspace("b"));
    registry.unregister("a");
    expect(registry.getActive()?.id).toBe("b");
  });

  it("unregister() del último workspace deja el activo en undefined", () => {
    const registry = new WorkspaceRegistry();
    registry.register(makeWorkspace("a"));
    registry.unregister("a");
    expect(registry.getActive()).toBeUndefined();
  });

  it("clear() vacía el registro y el activo", () => {
    const registry = new WorkspaceRegistry();
    registry.register(makeWorkspace("a"));
    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.getActive()).toBeUndefined();
  });
});
