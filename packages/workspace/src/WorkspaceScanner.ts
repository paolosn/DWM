import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { isExcluded } from "./glob.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { WorkspaceError } from "./errors/WorkspaceError.js";

export interface ScannedFileEntry {
  readonly relativePath: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface WorkspaceIndex {
  readonly files: readonly ScannedFileEntry[];
  readonly signature: string;
  readonly scannedAt: number;
}

/**
 * Escanea recursivamente `rootPath`, excluyendo cualquier ruta relativa
 * (fichero o directorio) que coincida con `excludePatterns` (glob simple:
 * "*" y "**"). Calcula una firma determinista del índice resultante (hash
 * de ruta+tamaño+mtime de cada fichero, en orden estable) que permite
 * detectar cambios comparando firmas entre escaneos sucesivos.
 */
export class WorkspaceScanner {
  async scan(rootPath: string, excludePatterns: readonly string[]): Promise<WorkspaceIndex> {
    const files: ScannedFileEntry[] = [];
    try {
      await this.walk(rootPath, "", excludePatterns, files);
    } catch (err) {
      throw WorkspaceError.wrap(err, {
        code: WorkspaceErrorCode.WORKSPACE_SCAN_FAILED,
        origin: "scan",
        recoverable: true,
        message: `Fallo al escanear el workspace en "${rootPath}".`,
      });
    }

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return { files, signature: this.computeSignature(files), scannedAt: Date.now() };
  }

  private async walk(
    rootPath: string,
    relativeDir: string,
    excludePatterns: readonly string[],
    out: ScannedFileEntry[]
  ): Promise<void> {
    const absoluteDir = path.join(rootPath, relativeDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (isExcluded(`${relativePath}/`, excludePatterns)) continue;
        await this.walk(rootPath, relativePath, excludePatterns, out);
      } else if (entry.isFile()) {
        if (isExcluded(relativePath, excludePatterns)) continue;
        const stat = await fs.stat(path.join(rootPath, relativePath));
        out.push({ relativePath, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  }

  private computeSignature(files: readonly ScannedFileEntry[]): string {
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(`${file.relativePath}:${file.size}:${file.mtimeMs}\n`);
    }
    return hash.digest("hex");
  }
}
