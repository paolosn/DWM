import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { PluginError } from "./errors/PluginError.js";
import type { PluginManifest } from "./PluginManifest.js";
import type { PluginMetadata } from "./PluginMetadata.js";
import type { PluginConfiguration } from "./PluginConfiguration.js";
import type { PluginState } from "./PluginState.js";
import type { PluginHealth } from "./PluginHealth.js";
import type { PluginPermission } from "./PluginPermissions.js";

export interface PersistedPlugin {
  readonly manifest: PluginManifest;
  readonly metadata: PluginMetadata;
  readonly configuration: PluginConfiguration;
  readonly grantedPermissions: readonly PluginPermission[];
  readonly state: PluginState;
  readonly health?: PluginHealth;
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de plugins instalados en disco:
 * cada plugin se guarda como un fichero JSON independiente bajo
 * `pluginsDir`. No persiste la instancia cargada de `Plugin` (no es
 * serializable): solo manifiesto, metadatos, configuración, permisos
 * concedidos, estado y última salud conocida.
 */
export class PluginStore {
  constructor(private readonly pluginsDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.pluginsDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedPlugin | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedPlugin;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_INVALID_MANIFEST,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el plugin persistido "${id}".`,
      });
    }
  }

  async write(persisted: PersistedPlugin): Promise<void> {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.manifest.id),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_INSTALL_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el plugin "${persisted.manifest.id}".`,
      });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(id));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_UNINSTALL_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar el plugin persistido "${id}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.pluginsDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_NOT_FOUND,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar los plugins persistidos en "${this.pluginsDir}".`,
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
