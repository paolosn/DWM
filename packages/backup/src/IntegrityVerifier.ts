import { createHash } from "node:crypto";
import type { BackupManifest } from "./BackupManifest.js";
import { BACKUP_FORMAT_VERSION } from "./BackupManifest.js";

export type IntegrityStatus = "valid" | "valid_with_warnings" | "invalid" | "unverifiable";

export interface IntegrityResult {
  readonly status: IntegrityStatus;
  readonly issues: readonly string[];
}

export function computeChecksum(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Verifica la integridad de un backup ya escrito: existencia del
 * contenido, versión de formato, checksum, tamaño y (para incrementales)
 * que el backup base exista. El resultado es un diagnóstico estructurado,
 * nunca un simple booleano.
 */
export class IntegrityVerifier {
  verify(
    manifest: BackupManifest,
    content: string | undefined,
    baseManifest?: BackupManifest | undefined,
    baseWasRequested = false
  ): IntegrityResult {
    if (content === undefined) {
      return {
        status: "unverifiable",
        issues: ["No se pudo leer el contenido del backup desde el proveedor."],
      };
    }

    const hardIssues: string[] = [];
    const softIssues: string[] = [];

    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
      hardIssues.push(`Versión de formato no compatible: "${manifest.formatVersion}".`);
    }

    const checksum = computeChecksum(content);
    if (manifest.checksum !== undefined && checksum !== manifest.checksum) {
      hardIssues.push("El checksum no coincide con el contenido almacenado.");
    }

    const sizeBytes = Buffer.byteLength(content, "utf-8");
    if (manifest.sizeBytes !== undefined && manifest.sizeBytes !== sizeBytes) {
      softIssues.push("El tamaño declarado no coincide exactamente con el contenido almacenado.");
    }

    if (manifest.type === "incremental") {
      if (!manifest.baseBackupId) {
        hardIssues.push("El backup incremental no declara baseBackupId.");
      } else if (baseWasRequested && !baseManifest) {
        hardIssues.push(`El backup base "${manifest.baseBackupId}" no existe.`);
      }
    }

    if (hardIssues.length > 0) {
      return { status: "invalid", issues: [...hardIssues, ...softIssues] };
    }
    if (softIssues.length > 0) {
      return { status: "valid_with_warnings", issues: softIssues };
    }
    return { status: "valid", issues: [] };
  }
}
