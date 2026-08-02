import { describe, it, expect } from "vitest";
import { EnvironmentError, createEnvironmentError } from "../../src/errors/EnvironmentError.js";
import { EnvironmentErrorCode } from "../../src/errors/EnvironmentErrorCode.js";

describe("EnvironmentError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createEnvironmentError({
      code: EnvironmentErrorCode.ENVIRONMENT_TOOL_NOT_FOUND,
      message: "no existe",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(EnvironmentError);
    expect(err.name).toBe("EnvironmentError");
    expect(err.code).toBe(EnvironmentErrorCode.ENVIRONMENT_TOOL_NOT_FOUND);
    expect(err.origin).toBe("registry");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "EnvironmentError",
      code: EnvironmentErrorCode.ENVIRONMENT_TOOL_NOT_FOUND,
      message: "no existe",
      origin: "registry",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo EnvironmentError si ya lo es", () => {
      const original = createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_PROCESS_SPAWN_FAILED,
        message: "fallo",
        origin: "process",
        recoverable: true,
      });
      const wrapped = EnvironmentError.wrap(original, {
        code: EnvironmentErrorCode.ENVIRONMENT_INVALID_REQUEST,
        origin: "request",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = EnvironmentError.wrap(new Error("boom"), {
        code: EnvironmentErrorCode.ENVIRONMENT_PROCESS_SPAWN_FAILED,
        origin: "process",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = EnvironmentError.wrap("no es un error", {
        code: EnvironmentErrorCode.ENVIRONMENT_PROCESS_SPAWN_FAILED,
        origin: "process",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de entorno");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = EnvironmentError.wrap(new Error("interno"), {
        code: EnvironmentErrorCode.ENVIRONMENT_PROCESS_SPAWN_FAILED,
        origin: "process",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
