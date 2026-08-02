import { promises as fs } from "node:fs";
import { resolveSafeExtractionPath } from "./PackagePathSafety.js";
import type { ConflictPolicy, PackageManifestEntry } from "./PortablePackageTypes.js";

export type ConflictAction = "write" | "skip" | "fail";

export interface ConflictDecision {
  readonly relativePath: string;
  readonly exists: boolean;
  readonly action: ConflictAction;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide, para cada entrada de fichero del manifiesto, si ya existe en
 * el destino y qué acción corresponde según la política de conflicto
 * ("fail" por defecto, "skip", u "overwrite" — siempre explícita). Las
 * carpetas nunca generan conflicto: crearlas es idempotente.
 */
export class PackageConflictResolver {
  async resolve(
    destinationDir: string,
    entries: readonly PackageManifestEntry[],
    policy: ConflictPolicy
  ): Promise<ConflictDecision[]> {
    const decisions: ConflictDecision[] = [];
    for (const entry of entries) {
      if (entry.type !== "file") continue;
      const targetPath = resolveSafeExtractionPath(destinationDir, entry.relativePath);
      const exists = await pathExists(targetPath);
      if (!exists) {
        decisions.push({ relativePath: entry.relativePath, exists: false, action: "write" });
        continue;
      }
      const action: ConflictAction =
        policy === "overwrite" ? "write" : policy === "skip" ? "skip" : "fail";
      decisions.push({ relativePath: entry.relativePath, exists: true, action });
    }
    return decisions;
  }
}
