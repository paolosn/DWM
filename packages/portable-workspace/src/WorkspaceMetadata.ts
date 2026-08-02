import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { isValidSemver } from "@dwm/core";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { WorkspaceError, createWorkspaceError } from "./errors/WorkspaceError.js";
import type { WorkspacePaths } from "./WorkspacePaths.js";

export const WORKSPACE_METADATA_FORMAT_VERSION = "1.0.0";

/**
 * Metadata del Workspace portable, persistida en `.dwm/workspace.json`.
 * Deliberadamente mínima: nunca contiene rutas absolutas ni ninguna otra
 * información dependiente de la ubicación física, para que el Workspace
 * siga siendo válido tras mover toda la carpeta a otra unidad o servicio.
 */
export interface WorkspaceMetadata {
  readonly id: string;
  readonly formatVersion: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function createInitialWorkspaceMetadata(): WorkspaceMetadata {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    formatVersion: WORKSPACE_METADATA_FORMAT_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchWorkspaceMetadata(metadata: WorkspaceMetadata): WorkspaceMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}

export function validateWorkspaceMetadataShape(value: unknown): value is WorkspaceMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.formatVersion === "string" &&
    isValidSemver(candidate.formatVersion) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export async function readWorkspaceMetadata(
  paths: WorkspacePaths
): Promise<WorkspaceMetadata | undefined> {
  try {
    const content = await fs.readFile(paths.metadataFile, "utf-8");
    const parsed = JSON.parse(content);
    if (!validateWorkspaceMetadataShape(parsed)) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.PWORKSPACE_INVALID_METADATA,
        message: `El fichero de metadata "${paths.metadataFile}" no tiene la forma esperada.`,
        origin: "metadata",
        recoverable: true,
      });
    }
    return parsed;
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw WorkspaceError.wrap(err, {
      code: WorkspaceErrorCode.PWORKSPACE_INVALID_METADATA,
      origin: "metadata",
      recoverable: true,
      message: `Fallo al cargar la metadata del Workspace portable en "${paths.metadataFile}".`,
    });
  }
}

export async function writeWorkspaceMetadata(
  paths: WorkspacePaths,
  metadata: WorkspaceMetadata
): Promise<void> {
  try {
    await fs.mkdir(paths.dwmDir, { recursive: true });
    await fs.writeFile(paths.metadataFile, JSON.stringify(metadata, null, 2), "utf-8");
  } catch (err) {
    throw WorkspaceError.wrap(err, {
      code: WorkspaceErrorCode.PWORKSPACE_PERSISTENCE_FAILED,
      origin: "persistence",
      recoverable: true,
      message: `Fallo al persistir la metadata del Workspace portable en "${paths.metadataFile}".`,
    });
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}
