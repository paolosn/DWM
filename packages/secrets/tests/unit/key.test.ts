import { describe, it, expect } from "vitest";
import { assertValidKey, assertValidValue } from "../../src/key.js";
import { SecretErrorCode } from "../../src/errors/SecretErrorCode.js";

describe("assertValidKey", () => {
  it("acepta claves válidas", () => {
    expect(() => assertValidKey("api-key")).not.toThrow();
    expect(() => assertValidKey("db.password")).not.toThrow();
  });

  it("rechaza clave vacía, con caracteres inseguros o traversal", () => {
    expect(() => assertValidKey("")).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_KEY })
    );
    expect(() => assertValidKey("a/b")).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_KEY })
    );
    expect(() => assertValidKey("a..b")).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_KEY })
    );
    expect(() => assertValidKey(undefined as never)).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_KEY })
    );
  });
});

describe("assertValidValue", () => {
  it("acepta un valor no vacío", () => {
    expect(() => assertValidValue("s3cr3t")).not.toThrow();
  });

  it("rechaza valor vacío o no-cadena", () => {
    expect(() => assertValidValue("")).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_VALUE })
    );
    expect(() => assertValidValue(undefined as never)).toThrow(
      expect.objectContaining({ code: SecretErrorCode.SECRETS_INVALID_VALUE })
    );
  });
});
