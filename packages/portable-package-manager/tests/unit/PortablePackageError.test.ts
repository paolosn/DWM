import { describe, it, expect } from "vitest";
import {
  PortablePackageError,
  createPortablePackageError,
} from "../../src/errors/PortablePackageError.js";
import { PortablePackageErrorCode } from "../../src/errors/PortablePackageErrorCode.js";

describe("PortablePackageError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createPortablePackageError({
      code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH,
      message: "ruta insegura",
      origin: "path",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(PortablePackageError);
    expect(err.name).toBe("PortablePackageError");
    expect(err.code).toBe(PortablePackageErrorCode.PACKAGE_UNSAFE_PATH);
    expect(err.origin).toBe("path");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "PortablePackageError",
      code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH,
      message: "ruta insegura",
      origin: "path",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo PortablePackageError si ya lo es", () => {
      const original = createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_BUILD_FAILED,
        message: "fallo",
        origin: "builder",
        recoverable: true,
      });
      const wrapped = PortablePackageError.wrap(original, {
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        origin: "reader",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = PortablePackageError.wrap(new Error("boom"), {
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        origin: "reader",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = PortablePackageError.wrap("no es un error", {
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        origin: "reader",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de paquetes portables");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = PortablePackageError.wrap(new Error("interno"), {
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        origin: "reader",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
