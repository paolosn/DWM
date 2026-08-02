import { promises as fs } from "node:fs";
import * as path from "node:path";
import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { BackupError } from "./errors/BackupError.js";
import type { BackupManifest } from "./BackupManifest.js";
import type { BackupState } from "./BackupState.js";
import type { BackupPolicy } from "./BackupPolicy.js";
import type { BackupProgress } from "./BackupProgress.js";
import type { BackupIssue } from "./BackupResult.js";

export interface PersistedBackup {
  readonly manifest: BackupManifest;
  readonly state: BackupState;
  readonly policy: BackupPolicy;
  readonly progress?: BackupProgress;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia del catálogo de backups en
 * disco (metadatos, estado, política, progreso y diagnósticos): cada
 * backup se guarda como un fichero JSON independiente bajo `catalogDir`.
 * No persiste el contenido del propio backup, que gestiona `BackupProvider`.
 */
export class BackupStore {
  constructor(private readonly catalogDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.catalogDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedBackup | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedBackup;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el catálogo del backup "${id}".`,
      });
    }
  }

  async write(persisted: PersistedBackup): Promise<void> {
    try {
      await fs.mkdir(this.catalogDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.manifest.id),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el catálogo del backup "${persisted.manifest.id}".`,
      });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(id));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar el catálogo del backup "${id}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.catalogDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar el catálogo de backups en "${this.catalogDir}".`,
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
