import { describe, it, expect } from "vitest";
import { DWMError } from "../src/errors/DWMError.js";
import { ErrorCode } from "../src/errors/ErrorCodes.js";

describe("DWMError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = new DWMError({
      code: ErrorCode.NOT_READY,
      message: "mensaje de prueba",
      origin: "lifecycle",
      recoverable: true,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DWMError");
    expect(err.code).toBe(ErrorCode.NOT_READY);
    expect(err.origin).toBe("lifecycle");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo DWMError si ya lo es", () => {
    const original = new DWMError({
      code: ErrorCode.NOT_READY,
      message: "original",
      origin: "lifecycle",
      recoverable: true,
    });
    const wrapped = DWMError.wrap(original, {
      code: ErrorCode.CONFIG_LOAD_FAILED,
      origin: "config",
      recoverable: false,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje por defecto", () => {
    const native = new Error("fallo nativo");
    const wrapped = DWMError.wrap(native, {
      code: ErrorCode.STORAGE_READ_FAILED,
      origin: "storage",
      recoverable: false,
    });
    expect(wrapped).toBeInstanceOf(DWMError);
    expect(wrapped.message).toBe("fallo nativo");
    expect(wrapped.cause).toBe(native);
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = DWMError.wrap("cadena cualquiera", {
      code: ErrorCode.STORAGE_READ_FAILED,
      origin: "storage",
      recoverable: false,
    });
    expect(wrapped.message).toBe("Error desconocido en el Core");
  });

  it("toJSON() produce una representación serializable sin campos internos", () => {
    const err = new DWMError({
      code: ErrorCode.NOT_READY,
      message: "mensaje",
      origin: "lifecycle",
      recoverable: true,
    });
    const json = err.toJSON();
    expect(json).toMatchObject({
      name: "DWMError",
      code: ErrorCode.NOT_READY,
      message: "mensaje",
      origin: "lifecycle",
      recoverable: true,
    });
  });
});
