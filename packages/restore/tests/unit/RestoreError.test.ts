import { describe, it, expect } from "vitest";
import {
  RestoreError,
  createRestoreError,
  RestoreErrorCode,
  RestoreManager,
  RestoreRegistry,
  ManagedRestoreTargetResolver,
} from "../../src/index.js";

describe("RestoreError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createRestoreError({
      code: RestoreErrorCode.RESTORE_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RestoreError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo RestoreError si ya lo es", () => {
    const original = createRestoreError({
      code: RestoreErrorCode.RESTORE_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = RestoreError.wrap(original, {
      code: RestoreErrorCode.RESTORE_APPLY_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = RestoreError.wrap(new Error("nativo"), {
      code: RestoreErrorCode.RESTORE_PROVIDER_ERROR,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = RestoreError.wrap("cadena", {
      code: RestoreErrorCode.RESTORE_PROVIDER_ERROR,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de restauración");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createRestoreError({
      code: RestoreErrorCode.RESTORE_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "RestoreError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/restore)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof RestoreManager).toBe("function");
    expect(typeof RestoreRegistry).toBe("function");
    expect(typeof ManagedRestoreTargetResolver).toBe("function");
  });
});
