import { describe, it, expect } from "vitest";
import { ClientError, createClientError } from "../../src/errors/ClientError.js";
import { ClientErrorCode } from "../../src/errors/ClientErrorCode.js";

describe("ClientError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createClientError({
      code: ClientErrorCode.CLIENT_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(ClientError);
    expect(err.name).toBe("ClientError");
    expect(err.code).toBe(ClientErrorCode.CLIENT_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "ClientError",
      code: ClientErrorCode.CLIENT_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo ClientError si ya lo es", () => {
      const original = createClientError({
        code: ClientErrorCode.CLIENT_WRITE_FAILED,
        message: "fallo",
        origin: "repository",
        recoverable: true,
      });
      const wrapped = ClientError.wrap(original, {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = ClientError.wrap(new Error("boom"), {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = ClientError.wrap("no es un error", {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de clientes");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = ClientError.wrap(new Error("interno"), {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
