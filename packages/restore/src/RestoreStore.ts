import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { BackupIssue } from "@dwm/backup";
import { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
import { RestoreError } from "./errors/RestoreError.js";
import type { RestoreState } from "./RestoreState.js";
import type { RestoreProgress } from "./RestoreProgress.js";
import type { RestoreRequest } from "./RestoreRequest.js";

export interface PersistedRestore {
  readonly restoreId: string;
  readonly request: RestoreRequest;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly state: RestoreState;
  readonly itemsRestored: number;
  readonly progress?: RestoreProgress;
  readonly warnings: readonly BackupIssue[];
  readonly errors: readonly BackupIssue[];
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia del historial de restauraciones
 * en disco: cada operación se guarda como un fichero JSON independiente
 * bajo `historyDir`.
 */
export class RestoreStore {
  constructor(private readonly historyDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.historyDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedRestore | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedRestore;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw RestoreError.wrap(err, {
        code: RestoreErrorCode.RESTORE_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el historial de la restauración "${id}".`,
      });
    }
  }

  async write(persisted: PersistedRestore): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.restoreId),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw RestoreError.wrap(err, {
        code: RestoreErrorCode.RESTORE_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el historial de la restauración "${persisted.restoreId}".`,
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
      throw RestoreError.wrap(err, {
        code: RestoreErrorCode.RESTORE_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar el historial de restauraciones en "${this.historyDir}".`,
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
