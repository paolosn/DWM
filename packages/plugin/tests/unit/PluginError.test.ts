import { describe, it, expect } from "vitest";
import {
  PluginError,
  createPluginError,
  PluginErrorCode,
  PluginManager,
  PluginRegistry,
  Plugin,
  StaticPluginSource,
} from "../../src/index.js";

describe("PluginError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createPluginError({
      code: PluginErrorCode.PLUGIN_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PluginError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo PluginError si ya lo es", () => {
    const original = createPluginError({
      code: PluginErrorCode.PLUGIN_INSTALL_FAILED,
      message: "x",
      origin: "lifecycle",
      recoverable: true,
    });
    const wrapped = PluginError.wrap(original, {
      code: PluginErrorCode.PLUGIN_ACTIVATE_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = PluginError.wrap(new Error("nativo"), {
      code: PluginErrorCode.PLUGIN_LOAD_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = PluginError.wrap("cadena", {
      code: PluginErrorCode.PLUGIN_LOAD_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de plugins");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createPluginError({
      code: PluginErrorCode.PLUGIN_UNINSTALL_FAILED,
      message: "m",
      origin: "lifecycle",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "PluginError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/plugin)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof PluginManager).toBe("function");
    expect(typeof PluginRegistry).toBe("function");
    expect(typeof Plugin).toBe("function");
    expect(typeof StaticPluginSource).toBe("function");
  });
});
