import { promises as fs } from "node:fs";
import * as path from "node:path";
import { WorkspacePaths } from "./WorkspacePaths.js";
import { readWorkspaceMetadata } from "./WorkspaceMetadata.js";
import type {
  PermissionCheckResult,
  SpaceCheckResult,
  WorkspaceValidationIssue,
  WorkspaceValidationResult,
} from "./WorkspaceTypes.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

/**
 * Valida la estructura de carpetas, los permisos de lectura/escritura, el
 * espacio disponible (cuando la plataforma lo permite) y la metadata del
 * Workspace portable, devolviendo siempre un diagnóstico estructurado.
 */
export class WorkspaceValidator {
  async validateStructure(root: string): Promise<WorkspaceValidationResult> {
    const paths = new WorkspacePaths(root);
    const issues: WorkspaceValidationIssue[] = [];
    for (const dir of paths.requiredDirectories()) {
      const stat = await fs.stat(dir).catch(() => undefined);
      if (!stat) {
        issues.push({ field: "structure", message: `Falta la carpeta obligatoria "${dir}".` });
      } else if (!stat.isDirectory()) {
        issues.push({ field: "structure", message: `"${dir}" existe pero no es una carpeta.` });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  async checkPermissions(root: string): Promise<PermissionCheckResult> {
    const canRead = await fs
      .access(root, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    const probeFile = path.join(
      root,
      `.dwm-write-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const canWrite = await fs
      .writeFile(probeFile, "probe", "utf-8")
      .then(() => fs.unlink(probeFile).catch(() => {}))
      .then(() => true)
      .catch(() => false);

    return { canRead, canWrite };
  }

  async checkSpace(root: string): Promise<SpaceCheckResult> {
    const statfs = (
      fs as unknown as { statfs?: (path: string) => Promise<{ bavail: number; bsize: number }> }
    ).statfs;
    if (typeof statfs !== "function") return { checked: false };
    try {
      const stats = await statfs(root);
      return { checked: true, availableBytes: stats.bavail * stats.bsize };
    } catch {
      return { checked: false };
    }
  }

  async validateMetadata(root: string): Promise<WorkspaceValidationResult> {
    const paths = new WorkspacePaths(root);
    try {
      const metadata = await readWorkspaceMetadata(paths);
      if (!metadata) {
        return {
          valid: false,
          issues: [{ field: "metadata", message: "No existe metadata del Workspace portable." }],
        };
      }
      return { valid: true, issues: [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, issues: [{ field: "metadata", message }] };
    }
  }

  /** Comprobación combinada: estructura, permisos y metadata. No sustituye a las comprobaciones individuales. */
  async validate(root: string): Promise<WorkspaceValidationResult> {
    const issues: WorkspaceValidationIssue[] = [];

    const structure = await this.validateStructure(root);
    issues.push(...structure.issues);

    const permissions = await this.checkPermissions(root);
    if (!permissions.canRead)
      issues.push({ field: "permissions", message: "No se puede leer la raíz de DWM." });
    if (!permissions.canWrite) {
      issues.push({ field: "permissions", message: "No se puede escribir en la raíz de DWM." });
    }

    const metadata = await this.validateMetadata(root);
    issues.push(...metadata.issues);

    return { valid: issues.length === 0, issues };
  }

  async assertValid(root: string): Promise<void> {
    const result = await this.validate(root);
    if (!result.valid) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.PWORKSPACE_VALIDATION_FAILED,
        message: `El Workspace portable en "${root}" no es válido: ${result.issues
          .map((i) => `[${i.field}] ${i.message}`)
          .join("; ")}`,
        origin: "validator",
        recoverable: true,
      });
    }
  }
}
