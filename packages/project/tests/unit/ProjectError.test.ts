import { describe, it, expect } from "vitest";
import {
  ProjectError,
  createProjectError,
  ProjectErrorCode,
  ProjectManager,
  ProjectRegistry,
  Project,
} from "../../src/index.js";

describe("ProjectError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createProjectError({
      code: ProjectErrorCode.PROJECT_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProjectError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo ProjectError si ya lo es", () => {
    const original = createProjectError({
      code: ProjectErrorCode.PROJECT_VALIDATION_FAILED,
      message: "x",
      origin: "validation",
      recoverable: true,
    });
    const wrapped = ProjectError.wrap(original, {
      code: ProjectErrorCode.PROJECT_OPEN_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = ProjectError.wrap(new Error("nativo"), {
      code: ProjectErrorCode.PROJECT_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = ProjectError.wrap("cadena", {
      code: ProjectErrorCode.PROJECT_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de proyectos");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createProjectError({
      code: ProjectErrorCode.PROJECT_SAVE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "ProjectError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/project)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof ProjectManager).toBe("function");
    expect(typeof ProjectRegistry).toBe("function");
    expect(typeof Project).toBe("function");
  });
});
