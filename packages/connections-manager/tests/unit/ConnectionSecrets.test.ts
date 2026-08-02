import { describe, it, expect } from "vitest";
import {
  redactSecretValues,
  toSafeError,
  maskedSecretPreview,
} from "../../src/ConnectionSecrets.js";

describe("ConnectionSecrets", () => {
  it("redactSecretValues() sustituye cada valor de secreto por una máscara fija", () => {
    const redacted = redactSecretValues("fallo con token abc123 en la petición", {
      token: "abc123",
    });
    expect(redacted).not.toContain("abc123");
    expect(redacted).toContain("••••••••");
  });

  it("redactSecretValues() ignora valores vacíos sin lanzar", () => {
    expect(redactSecretValues("mensaje sin secretos", { vacio: "" })).toBe("mensaje sin secretos");
  });

  it("toSafeError() añade code/timestamp y redacta el mensaje", () => {
    const safe = toSafeError("X_CODE", "fallo con clave-secreta", { k: "clave-secreta" });
    expect(safe.code).toBe("X_CODE");
    expect(safe.message).not.toContain("clave-secreta");
    expect(typeof safe.timestamp).toBe("string");
  });

  it("toSafeError() funciona sin secretos resueltos", () => {
    const safe = toSafeError("X_CODE", "mensaje limpio");
    expect(safe.message).toBe("mensaje limpio");
  });

  it("maskedSecretPreview() siempre devuelve la máscara fija, nunca un valor real", () => {
    expect(maskedSecretPreview()).toBe("••••••••");
  });
});
