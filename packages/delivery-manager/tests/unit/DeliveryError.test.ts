import { describe, it, expect } from "vitest";
import { DeliveryError, createDeliveryError } from "../../src/errors/DeliveryError.js";
import { DeliveryErrorCode } from "../../src/errors/DeliveryErrorCode.js";

describe("DeliveryError", () => {
  it("crea un error con la forma esperada y toJSON() serializable", () => {
    const err = createDeliveryError({
      code: DeliveryErrorCode.DELIVERY_NOT_FOUND,
      message: "no encontrada",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeliveryError);
    expect(err.name).toBe("DeliveryError");
    expect(err.code).toBe(DeliveryErrorCode.DELIVERY_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "DeliveryError",
      code: DeliveryErrorCode.DELIVERY_NOT_FOUND,
      message: "no encontrada",
      origin: "repository",
      recoverable: true,
    });
  });

  it("wrap() devuelve el mismo DeliveryError si ya lo es", () => {
    const original = createDeliveryError({
      code: DeliveryErrorCode.DELIVERY_HASH_FAILED,
      message: "fallo",
      origin: "repository",
      recoverable: true,
    });
    const wrapped = DeliveryError.wrap(original, {
      code: DeliveryErrorCode.DELIVERY_READ_FAILED,
      origin: "repository",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje por defecto", () => {
    const native = new Error("boom");
    const wrapped = DeliveryError.wrap(native, {
      code: DeliveryErrorCode.DELIVERY_WRITE_FAILED,
      origin: "repository",
      recoverable: true,
    });
    expect(wrapped.message).toBe("boom");
    expect(wrapped.cause).toBe(native);
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = DeliveryError.wrap("no es un error", {
      code: DeliveryErrorCode.DELIVERY_WRITE_FAILED,
      origin: "repository",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de entregas");
  });

  it("wrap() respeta un mensaje explícito aunque la causa sea un Error", () => {
    const wrapped = DeliveryError.wrap(new Error("original"), {
      code: DeliveryErrorCode.DELIVERY_WRITE_FAILED,
      origin: "repository",
      recoverable: true,
      message: "mensaje explícito",
    });
    expect(wrapped.message).toBe("mensaje explícito");
  });
});
