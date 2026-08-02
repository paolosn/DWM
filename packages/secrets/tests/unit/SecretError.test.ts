import { describe, it, expect } from "vitest";
import {
  SecretError,
  createSecretError,
  SecretErrorCode,
  SecretsManager,
  SecretStore,
  DefaultSecretProvider,
  createInitialEntry,
  withUpdatedCipherText,
  withRotatedCipherText,
} from "../../src/index.js";

describe("SecretError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_KEY,
      message: "m",
      origin: "key",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SecretError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo SecretError si ya lo es", () => {
    const original = createSecretError({
      code: SecretErrorCode.SECRETS_NOT_FOUND,
      message: "x",
      origin: "key",
      recoverable: true,
    });
    const wrapped = SecretError.wrap(original, {
      code: SecretErrorCode.SECRETS_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = SecretError.wrap(new Error("nativo"), {
      code: SecretErrorCode.SECRETS_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = SecretError.wrap("cadena", {
      code: SecretErrorCode.SECRETS_LOAD_FAILED,
      origin: "persistence",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en la gestión de secretos");
  });

  it("toJSON() produce una representación serializable sin datos sensibles", () => {
    const err = createSecretError({
      code: SecretErrorCode.SECRETS_SAVE_FAILED,
      message: "m",
      origin: "persistence",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "SecretError", recoverable: true });
  });
});

describe("SecretEntry", () => {
  it("createInitialEntry fija version=1 y createdAt=updatedAt", () => {
    const entry = createInitialEntry("k", "c");
    expect(entry.version).toBe(1);
    expect(entry.createdAt).toBe(entry.updatedAt);
  });

  it("withUpdatedCipherText mantiene la version y actualiza updatedAt", async () => {
    const entry = createInitialEntry("k", "c1");
    await new Promise((r) => setTimeout(r, 5));
    const updated = withUpdatedCipherText(entry, "c2");
    expect(updated.version).toBe(1);
    expect(updated.cipherText).toBe("c2");
    expect(updated.updatedAt).not.toBe(entry.updatedAt);
  });

  it("withRotatedCipherText incrementa version y marca rotatedAt", () => {
    const entry = createInitialEntry("k", "c1");
    const rotated = withRotatedCipherText(entry, "c2");
    expect(rotated.version).toBe(2);
    expect(rotated.rotatedAt).toBeDefined();
  });
});

describe("Punto de entrada público (@dwm/secrets)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof SecretsManager).toBe("function");
    expect(typeof SecretStore).toBe("function");
    expect(typeof DefaultSecretProvider).toBe("function");
  });
});
