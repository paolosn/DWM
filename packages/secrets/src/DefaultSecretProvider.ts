import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import type { SecretProvider } from "./SecretProvider.js";
import { SecretErrorCode } from "./errors/SecretErrorCode.js";
import { SecretError } from "./errors/SecretError.js";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

/**
 * Proveedor de cifrado por defecto: AES-256-GCM. Para cada valor cifrado se
 * genera una sal y un vector de inicialización nuevos, derivando la clave
 * real mediante `scrypt` a partir de la contraseña maestra y esa sal. La
 * salida opaca combina sal, IV, etiqueta de autenticación y texto cifrado,
 * todo en base64, separados por ".".
 */
export class DefaultSecretProvider implements SecretProvider {
  constructor(private readonly masterKey: string) {}

  async encrypt(plainText: string): Promise<string> {
    try {
      const salt = randomBytes(SALT_LENGTH);
      const iv = randomBytes(IV_LENGTH);
      const key = scryptSync(this.masterKey, salt, KEY_LENGTH);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [salt, iv, authTag, encrypted].map((buf) => buf.toString("base64")).join(".");
    } catch (err) {
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_ENCRYPTION_FAILED,
        origin: "crypto",
        recoverable: true,
        message: "Fallo al cifrar el valor del secreto.",
      });
    }
  }

  async decrypt(cipherText: string): Promise<string> {
    try {
      const parts = cipherText.split(".");
      if (parts.length !== 4) {
        throw new Error("Formato de texto cifrado inválido.");
      }
      const [saltB64, ivB64, authTagB64, encryptedB64] = parts as [string, string, string, string];
      const salt = Buffer.from(saltB64, "base64");
      const iv = Buffer.from(ivB64, "base64");
      const authTag = Buffer.from(authTagB64, "base64");
      const encrypted = Buffer.from(encryptedB64, "base64");
      const key = scryptSync(this.masterKey, salt, KEY_LENGTH);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf-8");
    } catch (err) {
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_DECRYPTION_FAILED,
        origin: "crypto",
        recoverable: true,
        message:
          "Fallo al descifrar el valor del secreto (clave maestra incorrecta o dato corrupto).",
      });
    }
  }
}
