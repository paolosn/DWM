import { describe, it, expect } from "vitest";
import {
  ConfigError,
  createConfigError,
  ConfigErrorCode,
  ConfigManager,
  ConfigStore,
} from "../../src/index.js";

describe("ConfigError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createConfigError({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
      message: "m",
      origin: "namespace",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConfigError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo ConfigError si ya lo es", () => {
    const original = createConfigError({
      code: ConfigErrorCode.CONFIG_SECTION_NOT_FOUND,
      message: "x",
      origin: "namespace",
      recoverable: true,
    });
    const wrapped = ConfigError.wrap(original, {
      code: ConfigErrorCode.CONFIG_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = ConfigError.wrap(new Error("nativo"), {
      code: ConfigErrorCode.CONFIG_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = ConfigError.wrap("cadena", {
      code: ConfigErrorCode.CONFIG_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en la configuración");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createConfigError({
      code: ConfigErrorCode.CONFIG_SAVE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "ConfigError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/config)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof ConfigManager).toBe("function");
    expect(typeof ConfigStore).toBe("function");
  });
});
