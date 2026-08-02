import { describe, it, expect } from "vitest";
import {
  StatusError,
  createStatusError,
  StatusErrorCode,
  StatusManager,
  StatusRegistry,
  StatusStore,
  makeCoreProvider,
} from "../../src/index.js";

describe("StatusError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createStatusError({
      code: StatusErrorCode.STATUS_PROVIDER_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("StatusError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo StatusError si ya lo es", () => {
    const original = createStatusError({
      code: StatusErrorCode.STATUS_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = StatusError.wrap(original, {
      code: StatusErrorCode.STATUS_PROVIDER_QUERY_FAILED,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = StatusError.wrap(new Error("nativo"), {
      code: StatusErrorCode.STATUS_PROVIDER_QUERY_FAILED,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = StatusError.wrap("cadena", {
      code: StatusErrorCode.STATUS_PROVIDER_QUERY_FAILED,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de estado");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createStatusError({
      code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "StatusError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/status)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof StatusManager).toBe("function");
    expect(typeof StatusRegistry).toBe("function");
    expect(typeof StatusStore).toBe("function");
    expect(typeof makeCoreProvider).toBe("function");
  });
});
