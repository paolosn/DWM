import { promises as fs } from "node:fs";
import { WorkspacePaths } from "./WorkspacePaths.js";
import {
  createInitialWorkspaceMetadata,
  readWorkspaceMetadata,
  writeWorkspaceMetadata,
  type WorkspaceMetadata,
} from "./WorkspaceMetadata.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { WorkspaceError } from "./errors/WorkspaceError.js";

export interface InitializeResult {
  readonly paths: WorkspacePaths;
  readonly metadata: WorkspaceMetadata;
  /** `true` si la metadata ya existía y se conservó tal cual; `false` si se acaba de crear. */
  readonly alreadyInitialized: boolean;
  readonly createdDirectories: readonly string[];
}

/**
 * Crea únicamente las carpetas que falten bajo la raíz de DWM (nunca
 * elimina ni sobrescribe nada existente) y, si no hay metadata todavía,
 * la crea; si ya existe, la conserva intacta.
 */
export class WorkspaceInitializer {
  async initialize(root: string): Promise<InitializeResult> {
    const paths = new WorkspacePaths(root);
    const createdDirectories: string[] = [];

    for (const dir of paths.requiredDirectories()) {
      const existedBefore = await this.exists(dir);
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (err) {
        throw WorkspaceError.wrap(err, {
          code: WorkspaceErrorCode.PWORKSPACE_INITIALIZATION_FAILED,
          origin: "initializer",
          recoverable: true,
          message: `Fallo al crear la carpeta requerida "${dir}".`,
        });
      }
      if (!existedBefore) createdDirectories.push(dir);
    }

    const existingMetadata = await readWorkspaceMetadata(paths);
    if (existingMetadata) {
      return { paths, metadata: existingMetadata, alreadyInitialized: true, createdDirectories };
    }

    const metadata = createInitialWorkspaceMetadata();
    await writeWorkspaceMetadata(paths, metadata);
    return { paths, metadata, alreadyInitialized: false, createdDirectories };
  }

  private async exists(dir: string): Promise<boolean> {
    try {
      await fs.access(dir);
      return true;
    } catch {
      return false;
    }
  }
}
