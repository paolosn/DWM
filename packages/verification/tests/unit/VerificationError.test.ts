import { describe, it, expect } from "vitest";
import {
  VerificationError,
  createVerificationError,
  VerificationErrorCode,
  VerificationManager,
  VerificationRegistry,
  VerificationCheckers,
} from "../../src/index.js";

describe("VerificationError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createVerificationError({
      code: VerificationErrorCode.VERIFICATION_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("VerificationError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo VerificationError si ya lo es", () => {
    const original = createVerificationError({
      code: VerificationErrorCode.VERIFICATION_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = VerificationError.wrap(original, {
      code: VerificationErrorCode.VERIFICATION_CHECK_FAILED,
      origin: "check",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = VerificationError.wrap(new Error("nativo"), {
      code: VerificationErrorCode.VERIFICATION_CHECK_FAILED,
      origin: "check",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = VerificationError.wrap("cadena", {
      code: VerificationErrorCode.VERIFICATION_CHECK_FAILED,
      origin: "check",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de verificación");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createVerificationError({
      code: VerificationErrorCode.VERIFICATION_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "VerificationError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/verification)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof VerificationManager).toBe("function");
    expect(typeof VerificationRegistry).toBe("function");
    expect(typeof VerificationCheckers.checkProjects).toBe("function");
  });
});
