import { promises as fs } from "node:fs";
import * as path from "node:path";
import { assertValidKey } from "./key.js";
import type { SecretEntry } from "./SecretEntry.js";
import { SecretErrorCode } from "./errors/SecretErrorCode.js";
import { SecretError } from "./errors/SecretError.js";

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de entradas de secreto en disco:
 * cada clave se guarda como un fichero JSON independiente bajo
 * `secretsDir`, conteniendo siempre la entrada ya cifrada
 * (`SecretEntry.cipherText`), nunca el valor en texto plano.
 */
export class SecretStore {
  constructor(private readonly secretsDir: string) {}

  private fileFor(key: string): string {
    return path.join(this.secretsDir, `${key}${FILE_SUFFIX}`);
  }

  async read(key: string): Promise<SecretEntry | undefined> {
    assertValidKey(key);
    try {
      const content = await fs.readFile(this.fileFor(key), "utf-8");
      return JSON.parse(content) as SecretEntry;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el secreto "${key}".`,
      });
    }
  }

  async write(entry: SecretEntry): Promise<void> {
    assertValidKey(entry.key);
    try {
      await fs.mkdir(this.secretsDir, { recursive: true });
      await fs.writeFile(this.fileFor(entry.key), JSON.stringify(entry, null, 2), "utf-8");
    } catch (err) {
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar el secreto "${entry.key}".`,
      });
    }
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    try {
      await fs.unlink(this.fileFor(key));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_DELETE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar el secreto "${key}".`,
      });
    }
  }

  async listKeys(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.secretsDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw SecretError.wrap(err, {
        code: SecretErrorCode.SECRETS_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar los secretos en "${this.secretsDir}".`,
      });
    }
  }

  private isNotFound(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    );
  }
}
