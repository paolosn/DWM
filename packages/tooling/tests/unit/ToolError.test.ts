import { describe, it, expect } from "vitest";
import {
  ToolError,
  createToolError,
  ToolErrorCode,
  ToolingManager,
  ToolRegistry,
  emptyToolCapabilities,
} from "../../src/index.js";

describe("ToolError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createToolError({
      code: ToolErrorCode.TOOL_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ToolError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo ToolError si ya lo es", () => {
    const original = createToolError({
      code: ToolErrorCode.TOOL_INIT_FAILED,
      message: "x",
      origin: "lifecycle",
      recoverable: true,
    });
    const wrapped = ToolError.wrap(original, {
      code: ToolErrorCode.TOOL_ACTIVATE_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = ToolError.wrap(new Error("nativo"), {
      code: ToolErrorCode.TOOL_INIT_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = ToolError.wrap("cadena", {
      code: ToolErrorCode.TOOL_INIT_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de herramientas");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createToolError({
      code: ToolErrorCode.TOOL_REMOVE_FAILED,
      message: "m",
      origin: "lifecycle",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "ToolError", recoverable: true });
  });
});

describe("emptyToolCapabilities", () => {
  it("devuelve provided/required vacíos", () => {
    expect(emptyToolCapabilities()).toEqual({ provided: [], required: [] });
  });
});

describe("Punto de entrada público (@dwm/tooling)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof ToolingManager).toBe("function");
    expect(typeof ToolRegistry).toBe("function");
  });
});
