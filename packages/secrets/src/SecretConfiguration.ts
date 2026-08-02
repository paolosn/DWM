import { SecretErrorCode } from "./errors/SecretErrorCode.js";
import { createSecretError } from "./errors/SecretError.js";

export interface SecretConfiguration {
  /** Directorio donde se persiste una entrada cifrada por clave (un fichero JSON cada una). */
  readonly secretsDir: string;
  /**
   * Contraseña maestra de la que se deriva la clave de cifrado real. Nunca
   * se persiste; solo vive en memoria mientras el proceso está en marcha.
   */
  readonly masterKey: string;
}

export function validateSecretConfiguration(config: SecretConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION,
      message: "SecretConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.secretsDir !== "string" || config.secretsDir.length === 0) {
    throw createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION,
      message: "SecretConfiguration.secretsDir es obligatorio y debe ser una cadena no vacía.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (typeof config.masterKey !== "string" || config.masterKey.length < 8) {
    throw createSecretError({
      code: SecretErrorCode.SECRETS_INVALID_CONFIGURATION,
      message: "SecretConfiguration.masterKey es obligatoria y debe tener al menos 8 caracteres.",
      origin: "configuration",
      recoverable: false,
    });
  }
}
