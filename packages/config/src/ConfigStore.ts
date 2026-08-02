import { promises as fs } from "node:fs";
import * as path from "node:path";
import { assertValidNamespace } from "./namespace.js";
import { ConfigErrorCode } from "./errors/ConfigErrorCode.js";
import { ConfigError } from "./errors/ConfigError.js";

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de secciones de configuración en
 * disco: cada namespace se guarda como un fichero JSON independiente bajo
 * `configDir`. No mantiene ningún estado en memoria: eso es responsabilidad
 * de `ConfigManager` (caché).
 */
export class ConfigStore {
  constructor(private readonly configDir: string) {}

  private fileFor(namespace: string): string {
    return path.join(this.configDir, `${namespace}${FILE_SUFFIX}`);
  }

  async read<T>(namespace: string): Promise<T | undefined> {
    assertValidNamespace(namespace);
    try {
      const content = await fs.readFile(this.fileFor(namespace), "utf-8");
      return JSON.parse(content) as T;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw ConfigError.wrap(err, {
        code: ConfigErrorCode.CONFIG_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar la sección de configuración "${namespace}".`,
      });
    }
  }

  async write<T>(namespace: string, value: T): Promise<void> {
    assertValidNamespace(namespace);
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      await fs.writeFile(this.fileFor(namespace), JSON.stringify(value, null, 2), "utf-8");
    } catch (err) {
      throw ConfigError.wrap(err, {
        code: ConfigErrorCode.CONFIG_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar la sección de configuración "${namespace}".`,
      });
    }
  }

  async delete(namespace: string): Promise<void> {
    assertValidNamespace(namespace);
    try {
      await fs.unlink(this.fileFor(namespace));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw ConfigError.wrap(err, {
        code: ConfigErrorCode.CONFIG_DELETE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar la sección de configuración "${namespace}".`,
      });
    }
  }

  async listNamespaces(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.configDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw ConfigError.wrap(err, {
        code: ConfigErrorCode.CONFIG_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar las secciones de configuración en "${this.configDir}".`,
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
