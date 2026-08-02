import { describe, it, expect } from "vitest";
import {
  WorkspaceError,
  createWorkspaceError,
  WorkspaceErrorCode,
  PortableWorkspaceManager,
  WorkspaceRegistry,
  WorkspaceLocator,
  WorkspaceInitializer,
  WorkspaceValidator,
  WorkspacePaths,
} from "../../src/index.js";

describe("WorkspaceError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createWorkspaceError({
      code: WorkspaceErrorCode.PWORKSPACE_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WorkspaceError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo WorkspaceError si ya lo es", () => {
    const original = createWorkspaceError({
      code: WorkspaceErrorCode.PWORKSPACE_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = WorkspaceError.wrap(original, {
      code: WorkspaceErrorCode.PWORKSPACE_INITIALIZATION_FAILED,
      origin: "initializer",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = WorkspaceError.wrap(new Error("nativo"), {
      code: WorkspaceErrorCode.PWORKSPACE_PERSISTENCE_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = WorkspaceError.wrap("cadena", {
      code: WorkspaceErrorCode.PWORKSPACE_PERSISTENCE_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de workspace portable");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createWorkspaceError({
      code: WorkspaceErrorCode.PWORKSPACE_VALIDATION_FAILED,
      message: "m",
      origin: "validator",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "WorkspaceError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/portable-workspace)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof PortableWorkspaceManager).toBe("function");
    expect(typeof WorkspaceRegistry).toBe("function");
    expect(typeof WorkspaceLocator).toBe("function");
    expect(typeof WorkspaceInitializer).toBe("function");
    expect(typeof WorkspaceValidator).toBe("function");
    expect(typeof WorkspacePaths).toBe("function");
  });
});
