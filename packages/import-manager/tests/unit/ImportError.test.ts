import { describe, it, expect } from "vitest";
import {
  ImportError,
  createImportError,
  ImportErrorCode,
  ImportManager,
  ImportRegistry,
  ImportScanner,
  ImportValidator,
  ImportService,
  ImportStore,
} from "../../src/index.js";

describe("ImportError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createImportError({
      code: ImportErrorCode.IMPORT_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ImportError");
    expect(err.code).toBe(ImportErrorCode.IMPORT_NOT_FOUND);
    expect(err.origin).toBe("registry");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo ImportError si ya lo es", () => {
    const original = createImportError({
      code: ImportErrorCode.IMPORT_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = ImportError.wrap(original, {
      code: ImportErrorCode.IMPORT_COPY_FAILED,
      origin: "copy",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = ImportError.wrap(new Error("nativo"), {
      code: ImportErrorCode.IMPORT_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
    expect(wrapped.cause).toBeInstanceOf(Error);
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = ImportError.wrap("cadena", {
      code: ImportErrorCode.IMPORT_SCAN_FAILED,
      origin: "scan",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de importación");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createImportError({
      code: ImportErrorCode.IMPORT_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "ImportError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/import-manager)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof ImportManager).toBe("function");
    expect(typeof ImportRegistry).toBe("function");
    expect(typeof ImportScanner).toBe("function");
    expect(typeof ImportValidator).toBe("function");
    expect(typeof ImportService).toBe("function");
    expect(typeof ImportStore).toBe("function");
  });
});
