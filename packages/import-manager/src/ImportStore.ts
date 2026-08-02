import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ImportIssue, ImportRequest } from "./ImportTypes.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { ImportError } from "./errors/ImportError.js";
import type { ImportState } from "./ImportState.js";
import type { ImportProgress } from "./ImportProgress.js";

export interface PersistedImport {
  readonly importId: string;
  readonly request: ImportRequest;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly destinationPath?: string;
  readonly state: ImportState;
  readonly filesImported: number;
  readonly directoriesImported: number;
  readonly progress?: ImportProgress;
  readonly warnings: readonly ImportIssue[];
  readonly errors: readonly ImportIssue[];
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia del historial de importaciones
 * en disco: cada operación se guarda como un fichero JSON independiente
 * bajo `historyDir`.
 */
export class ImportStore {
  constructor(private readonly historyDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.historyDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedImport | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedImport;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el historial de la importación "${id}".`,
      });
    }
  }

  async write(persisted: PersistedImport): Promise<void> {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.importId),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir el historial de la importación "${persisted.importId}".`,
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
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar el historial de importaciones en "${this.historyDir}".`,
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
