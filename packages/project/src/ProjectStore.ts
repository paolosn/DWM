import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ProjectErrorCode } from "./errors/ProjectErrorCode.js";
import { ProjectError } from "./errors/ProjectError.js";
import type { ProjectMetadata } from "./ProjectMetadata.js";
import type { ProjectConfiguration } from "./ProjectConfiguration.js";

export interface PersistedProject {
  readonly metadata: ProjectMetadata;
  readonly configuration: ProjectConfiguration;
}

const FILE_SUFFIX = ".json";

/**
 * Responsable exclusivo de la persistencia de proyectos en disco: cada
 * proyecto se guarda como un fichero JSON independiente bajo
 * `projectsDir`, conteniendo únicamente metadatos y configuración (nunca
 * el estado en memoria, que es transitorio de la sesión).
 */
export class ProjectStore {
  constructor(private readonly projectsDir: string) {}

  private fileFor(id: string): string {
    return path.join(this.projectsDir, `${id}${FILE_SUFFIX}`);
  }

  async read(id: string): Promise<PersistedProject | undefined> {
    try {
      const content = await fs.readFile(this.fileFor(id), "utf-8");
      return JSON.parse(content) as PersistedProject;
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar el proyecto "${id}".`,
      });
    }
  }

  async write(persisted: PersistedProject): Promise<void> {
    try {
      await fs.mkdir(this.projectsDir, { recursive: true });
      await fs.writeFile(
        this.fileFor(persisted.metadata.id),
        JSON.stringify(persisted, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar el proyecto "${persisted.metadata.id}".`,
      });
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(id));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_DELETE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al eliminar el proyecto "${id}".`,
      });
    }
  }

  async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.projectsDir);
      return entries
        .filter((name) => name.endsWith(FILE_SUFFIX))
        .map((name) => name.slice(0, -FILE_SUFFIX.length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw ProjectError.wrap(err, {
        code: ProjectErrorCode.PROJECT_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al listar los proyectos en "${this.projectsDir}".`,
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
