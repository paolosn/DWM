import { describe, it, expect } from "vitest";
import { validateSecretConfiguration } from "../../src/SecretConfiguration.js";
import { SecretErrorCode } from "../../src/errors/SecretErrorCode.js";

describe("validateSecretConfiguration", () => {
  it("acepta una configuración válida", () => {
    expect(() =>
      validateSecretConfiguration({ secretsDir: "/tmp/x", masterKey: "clave-larga-suficiente" })
    ).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateSecretConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION })
    );
  });

  it("rechaza secretsDir vacío o ausente", () => {
    expect(() =>
      validateSecretConfiguration({ secretsDir: "", masterKey: "clave-larga-suficiente" })
    ).toThrow(expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION }));
  });

  it("rechaza masterKey ausente o demasiado corta", () => {
    expect(() => validateSecretConfiguration({ secretsDir: "/tmp/x", masterKey: "corta" })).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION })
    );
    expect(() =>
      validateSecretConfiguration({ secretsDir: "/tmp/x", masterKey: undefined as never })
    ).toThrow(expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION }));
  });
});
