import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { BackupIssue } from "@dwm/backup";
import { MigrationErrorCode } from "./errors/MigrationErrorCode.js";
import { MigrationError } from "./errors/MigrationError.js";
import type { MigrationState } from "./MigrationState.js";
import type { MigrationExportRequest, MigrationImportRequest } from "./MigrationRequest.js";

export interface PersistedMigration {
  readonly migrationId: string;
  readonly direction: "export" | "import";
  readonly request: MigrationExportRequest | MigrationImportRequest;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly state: MigrationState;
  readonly backupId?: string;
  readonly restoreId?: string;
  readonly sourceDwmVersion?: string;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia del historial de migraciones en
 * disco: cada operación se guarda como un fichero JSON independiente bajo
 * `historyDir`.
 */
export class MigrationStore {
  constructor(private readonly historyDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.historyDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedMigration | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedMigration;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw MigrationError.wrap(err, {
        code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el historial de la migración "${id}".`,
      });
    }
  }

  async write(persisted: PersistedMigration): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.migrationId),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw MigrationError.wrap(err, {
        code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el historial de la migración "${persisted.migrationId}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.historyDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw MigrationError.wrap(err, {
        code: MigrationErrorCode.MIGRATION_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar el historial de migraciones en "${this.historyDir}".`,
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
