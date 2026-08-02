import { describe, it, expect } from "vitest";
import { DefaultSecretProvider } from "../../src/DefaultSecretProvider.js";
import { SecretErrorCode } from "../../src/errors/SecretErrorCode.js";

describe("DefaultSecretProvider", () => {
  it("cifra y descifra correctamente un valor", async () => {
    const provider = new DefaultSecretProvider("clave-maestra-larga");
    const cipherText = await provider.encrypt("mi-valor-secreto");
    expect(cipherText).not.toContain("mi-valor-secreto");
    await expect(provider.decrypt(cipherText)).resolves.toBe("mi-valor-secreto");
  });

  it("dos cifrados del mismo valor producen salidas distintas (sal e IV aleatorios)", async () => {
    const provider = new DefaultSecretProvider("clave-maestra-larga");
    const a = await provider.encrypt("valor");
    const b = await provider.encrypt("valor");
    expect(a).not.toBe(b);
  });

  it("descifrar con una clave maestra incorrecta lanza SECRETS_DECRYPTION_FAILED", async () => {
    const provider = new DefaultSecretProvider("clave-correcta");
    const cipherText = await provider.encrypt("valor");
    const otherProvider = new DefaultSecretProvider("clave-incorrecta");
    await expect(otherProvider.decrypt(cipherText)).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_DECRYPTION_FAILED,
    });
  });

  it("descifrar un texto cifrado con formato inválido lanza SECRETS_DECRYPTION_FAILED", async () => {
    const provider = new DefaultSecretProvider("clave-maestra-larga");
    await expect(provider.decrypt("formato-invalido")).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_DECRYPTION_FAILED,
    });
  });

  it("descifrar un texto cifrado manipulado (autenticación) lanza SECRETS_DECRYPTION_FAILED", async () => {
    const provider = new DefaultSecretProvider("clave-maestra-larga");
    const cipherText = await provider.encrypt("valor");
    const parts = cipherText.split(".");
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      Buffer.from("manipulado").toString("base64"),
    ].join(".");
    await expect(provider.decrypt(tampered)).rejects.toMatchObject({
      code: SecretErrorCode.SECRETS_DECRYPTION_FAILED,
    });
  });
});
