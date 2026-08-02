import { describe, it, expect } from "vitest";
import {
  BackupError,
  createBackupError,
  BackupErrorCode,
  BackupManager,
  BackupRegistry,
  LocalBackupProvider,
} from "../../src/index.js";

describe("BackupError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createBackupError({
      code: BackupErrorCode.BACKUP_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BackupError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo BackupError si ya lo es", () => {
    const original = createBackupError({
      code: BackupErrorCode.BACKUP_INVALID_REQUEST,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = BackupError.wrap(original, {
      code: BackupErrorCode.BACKUP_WRITE_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = BackupError.wrap(new Error("nativo"), {
      code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = BackupError.wrap("cadena", {
      code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
      origin: "provider",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de backups");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createBackupError({
      code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "BackupError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/backup)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof BackupManager).toBe("function");
    expect(typeof BackupRegistry).toBe("function");
    expect(typeof LocalBackupProvider).toBe("function");
  });
});
