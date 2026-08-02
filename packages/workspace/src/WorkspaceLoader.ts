import { promises as fs } from "node:fs";
import * as path from "node:path";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { WorkspaceError, createWorkspaceError } from "./errors/WorkspaceError.js";
import type { WorkspaceMetadata } from "./WorkspaceMetadata.js";
import type { WorkspaceConfiguration } from "./WorkspaceConfiguration.js";
import { validateWorkspaceConfiguration } from "./WorkspaceConfiguration.js";

const WORKSPACE_DIR_NAME = ".dwm-workspace";
const METADATA_FILE_NAME = "metadata.json";
const CONFIGURATION_FILE_NAME = "configuration.json";

function workspaceDir(rootPath: string): string {
  return path.join(rootPath, WORKSPACE_DIR_NAME);
}

/**
 * Responsable exclusivo de la persistencia de metadatos y configuración de
 * un workspace en disco, y de validar que una ruta es (o puede convertirse
 * en) un workspace válido.
 */
export class WorkspaceLoader {
  /** Verifica que `rootPath` exista y sea un directorio. No exige que ya sea un workspace. */
  async assertValidPath(rootPath: string): Promise<void> {
    let stat;
    try {
      stat = await fs.stat(rootPath);
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_INVALID_PATH,
        origin: "path",
        recoverable: true,
        message: `La ruta "${rootPath}" no existe o no es accesible.`,
      });
    }
    if (!stat.isDirectory()) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_INVALID_PATH,
        message: `La ruta "${rootPath}" no es un directorio.`,
        origin: "path",
        recoverable: true,
      });
    }
  }

  /** Indica si `rootPath` ya contiene la estructura de un workspace (metadatos persistidos). */
  async isWorkspace(rootPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(workspaceDir(rootPath), METADATA_FILE_NAME));
      return true;
    } catch {
      return false;
    }
  }

  async loadMetadata(rootPath: string): Promise<WorkspaceMetadata> {
    const filePath = path.join(workspaceDir(rootPath), METADATA_FILE_NAME);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as WorkspaceMetadata;
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar los metadatos del workspace en "${rootPath}".`,
      });
    }
  }

  async loadConfiguration(rootPath: string): Promise<WorkspaceConfiguration> {
    const filePath = path.join(workspaceDir(rootPath), CONFIGURATION_FILE_NAME);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const config = JSON.parse(content) as WorkspaceConfiguration;
      validateWorkspaceConfiguration(config);
      return config;
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_LOAD_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al cargar la configuración del workspace en "${rootPath}".`,
      });
    }
  }

  async saveMetadata(rootPath: string, metadata: WorkspaceMetadata): Promise<void> {
    try {
      await fs.mkdir(workspaceDir(rootPath), { recursive: true });
      await fs.writeFile(
        path.join(workspaceDir(rootPath), METADATA_FILE_NAME),
        JSON.stringify(metadata, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar los metadatos del workspace en "${rootPath}".`,
      });
    }
  }

  async saveConfiguration(rootPath: string, configuration: WorkspaceConfiguration): Promise<void> {
    try {
      await fs.mkdir(workspaceDir(rootPath), { recursive: true });
      await fs.writeFile(
        path.join(workspaceDir(rootPath), CONFIGURATION_FILE_NAME),
        JSON.stringify(configuration, null, 2),
        "utf-8"
      );
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_SAVE_FAILED,
        origin: "persistence",
        recoverable: true,
        message: `Fallo al guardar la configuración del workspace en "${rootPath}".`,
      });
    }
  }
}
