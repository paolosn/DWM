import { describe, it, expect } from "vitest";
import {
  PSNError,
  createPSNError,
  PSNErrorCode,
  PSNAdapter,
  PSNScanner,
  PSNRegistry,
} from "../../src/index.js";

describe("PSNError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createPSNError({
      code: PSNErrorCode.PSN_MODEL_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("PSNError");
    expect(err.code).toBe(PSNErrorCode.PSN_MODEL_NOT_FOUND);
    expect(err.origin).toBe("registry");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo PSNError si ya lo es", () => {
    const original = createPSNError({
      code: PSNErrorCode.PSN_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = PSNError.wrap(original, {
      code: PSNErrorCode.PSN_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = PSNError.wrap(new Error("nativo"), {
      code: PSNErrorCode.PSN_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
    expect(wrapped.cause).toBeInstanceOf(Error);
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = PSNError.wrap("cadena", {
      code: PSNErrorCode.PSN_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el adaptador PSN");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createPSNError({
      code: PSNErrorCode.PSN_ROOT_NOT_FOUND,
      message: "m",
      origin: "root",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "PSNError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/psn-adapter)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof PSNAdapter).toBe("function");
    expect(typeof PSNScanner).toBe("function");
    expect(typeof PSNRegistry).toBe("function");
  });
});
