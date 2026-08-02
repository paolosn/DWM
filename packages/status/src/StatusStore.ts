import { promises as fs } from "node:fs";
import * as path from "node:path";
import { StatusErrorCode } from "./errors/StatusErrorCode.js";
import { StatusError } from "./errors/StatusError.js";
import type { GlobalStatusReport } from "./StatusTypes.js";

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de instantáneas del estado
 * global en disco: cada instantánea se guarda como un fichero JSON
 * independiente bajo `snapshotsDir`.
 */
export class StatusStore {
  constructor(private readonly snapshotsDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.snapshotsDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<GlobalStatusReport | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as GlobalStatusReport;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw StatusError.wrap(err, {
        code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar la instantánea de estado "${id}".`,
      });
    }
  }

  async write(snapshot: GlobalStatusReport): Promise<void> {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(snapshot.snapshotId),
        JSON.stringify(snapshot, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw StatusError.wrap(err, {
        code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al persistir la instantánea de estado "${snapshot.snapshotId}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.snapshotsDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw StatusError.wrap(err, {
        code: StatusErrorCode.STATUS_PERSISTENCE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar las instantáneas de estado en "${this.snapshotsDir}".`,
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
