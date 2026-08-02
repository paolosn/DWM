import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ProfileErrorCode } from "./errors/ProfileErrorCode.js";
import { ProfileError } from "./errors/ProfileError.js";
import type { ProfileMetadata } from "./ProfileMetadata.js";
import type { ProfileConfiguration } from "./ProfileConfiguration.js";

export interface PersistedProfile {
  readonly metadata: ProfileMetadata;
  readonly configuration: ProfileConfiguration;
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de perfiles en disco: cada
 * perfil se guarda como un fichero JSON independiente bajo `profilesDir`,
 * conteniendo únicamente metadatos y configuración (nunca el estado en
 * memoria, que es transitorio de la sesión).
 */
export class ProfileStore {
  constructor(private readonly profilesDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.profilesDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedProfile | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedProfile;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el perfil "${id}".`,
      });
    }
  }

  async write(persisted: PersistedProfile): Promise<void> {
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.metadata.id),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar el perfil "${persisted.metadata.id}".`,
      });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(id));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_DELETE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar el perfil "${id}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.profilesDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw ProfileError.wrap(err, {
        code: ProfileErrorCode.PROFILE_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar los perfiles en "${this.profilesDir}".`,
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
