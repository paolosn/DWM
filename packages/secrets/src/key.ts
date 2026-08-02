import { SecretErrorCode } from "./errors/SecretErrorCode.js";
import { createSecretError } from "./errors/SecretError.js";

const VALID_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Valida que `key` sea un identificador seguro para usarse como nombre de fichero. */
export function assertValidKey(key: string): void {
  if (typeof key !== "string" || key.length === 0 || !VALID_KEY.test(key) || key.includes("..")) {
    throw createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_KEY,
      message: `Clave de secreto inválida: "${String(key)}".`,
      origin: "key",
      recoverable: true,
    });
  }
}

/** Valida que `value` sea un valor de secreto no vacío. */
export function assertValidValue(value: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_VALUE,
      message: "El valor del secreto debe ser una cadena no vacía.",
      origin: "value",
      recoverable: true,
    });
  }
}
