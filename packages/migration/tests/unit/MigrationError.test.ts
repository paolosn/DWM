import { describe, it, expect } from "vitest";
import {
  MigrationError,
  createMigrationError,
  MigrationErrorCode,
  MigrationManager,
  MigrationRegistry,
  MigrationConflictDetector,
} from "../../src/index.js";

describe("MigrationError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createMigrationError({
      code: MigrationErrorCode.MIGRATION_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MigrationError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo MigrationError si ya lo es", () => {
    const original = createMigrationError({
      code: MigrationErrorCode.MIGRATION_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = MigrationError.wrap(original, {
      code: MigrationErrorCode.MIGRATION_EXPORT_FAILED,
      origin: "backup",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = MigrationError.wrap(new Error("nativo"), {
      code: MigrationErrorCode.MIGRATION_IMPORT_FAILED,
      origin: "restore",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = MigrationError.wrap("cadena", {
      code: MigrationErrorCode.MIGRATION_IMPORT_FAILED,
      origin: "restore",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de migraciones");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createMigrationError({
      code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "MigrationError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/migration)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof MigrationManager).toBe("function");
    expect(typeof MigrationRegistry).toBe("function");
    expect(typeof MigrationConflictDetector).toBe("function");
  });
});
