import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import type { ImportEntry, ImportScanResult, ImportSourceType } from "./ImportTypes.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { ImportError, createImportError } from "./errors/ImportError.js";

export interface CopyProgressUpdate {
  readonly itemsProcessed: number;
  readonly itemsTotal: number;
  readonly currentEntry: string;
}

export interface CopyToStagingOptions {
  readonly dryRun?: boolean;
  onProgress?(update: CopyProgressUpdate): void | Promise<void>;
}

export interface CopyToStagingResult {
  readonly filesCopied: number;
  readonly directoriesCopied: number;
}

const FILE_MODE_MASK = 0o777;

/**
 * Motor de copia física de `@dwm/import-manager`: copia (nunca modifica)
 * ficheros y carpetas —incluidos ocultos, symlinks y permisos— desde una
 * carpeta, ZIP o Workspace DWM anterior hacia una carpeta de staging, y
 * solo cuando esa copia queda validada la promueve atómicamente al destino
 * final. Ante cualquier fallo, la carpeta de staging se descarta: nunca se
 * deja un Workspace parcialmente importado.
 */
export class ImportService {
  createStagingDir(baseDir: string): string {
    return path.join(baseDir, `.import-staging-${randomUUID()}`);
  }

  async copyToStaging(
    sourceType: ImportSourceType,
    sourcePath: string,
    scan: ImportScanResult,
    stagingDir: string,
    options: CopyToStagingOptions = {}
  ): Promise<CopyToStagingResult> {
    try {
      await fs.mkdir(stagingDir, { recursive: true });

      for (const dir of scan.directories) {
        if (!options.dryRun) {
          await fs.mkdir(path.join(stagingDir, dir), { recursive: true });
        }
      }

      if (sourceType === "zip") {
        await this.copyFromZip(sourcePath, scan.entries, stagingDir, options);
      } else {
        await this.copyFromFolder(sourcePath, scan.entries, stagingDir, options);
      }

      return { filesCopied: scan.entries.length, directoriesCopied: scan.directories.length };
    } catch (err) {
      await this.rollbackStaging(stagingDir).catch(() => {});
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_COPY_FAILED,
        origin: "copy",
        recoverable: true,
        message: `Fallo al copiar el origen "${sourcePath}" a staging.`,
      });
    }
  }

  private async copyFromFolder(
    sourcePath: string,
    entries: readonly ImportEntry[],
    stagingDir: string,
    options: CopyToStagingOptions
  ): Promise<void> {
    let processed = 0;
    for (const entry of entries) {
      const from = path.join(sourcePath, entry.relativePath);
      const to = path.join(stagingDir, entry.relativePath);

      if (!options.dryRun) {
        await fs.mkdir(path.dirname(to), { recursive: true });
        if (entry.symlinkTarget !== undefined) {
          await fs.symlink(entry.symlinkTarget, to);
        } else {
          await fs.copyFile(from, to);
          if (entry.mode !== undefined) {
            await fs.chmod(to, entry.mode & FILE_MODE_MASK);
          }
        }
      }

      processed += 1;
      await options.onProgress?.({
        itemsProcessed: processed,
        itemsTotal: entries.length,
        currentEntry: entry.relativePath,
      });
    }
  }

  private async copyFromZip(
    zipPath: string,
    entries: readonly ImportEntry[],
    stagingDir: string,
    options: CopyToStagingOptions
  ): Promise<void> {
    const zip = new AdmZip(zipPath);
    let processed = 0;
    for (const entry of entries) {
      const to = path.join(stagingDir, entry.relativePath);

      if (!options.dryRun) {
        const zipEntry = zip.getEntry(entry.relativePath);
        if (!zipEntry) {
          throw createImportError({
            code: ImportErrorCode.IMPORT_COPY_FAILED,
            message: `El fichero "${entry.relativePath}" ya no está presente en el ZIP "${zipPath}".`,
            origin: "copy",
            recoverable: true,
          });
        }
        await fs.mkdir(path.dirname(to), { recursive: true });
        const content = zipEntry.getData();
        await fs.writeFile(to, content);
      }

      processed += 1;
      await options.onProgress?.({
        itemsProcessed: processed,
        itemsTotal: entries.length,
        currentEntry: entry.relativePath,
      });
    }
  }

  async destinationExists(destinationPath: string): Promise<boolean> {
    try {
      await fs.stat(destinationPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Promueve atómicamente (según lo permita el sistema de ficheros) el
   * contenido de `stagingDir` a `destinationPath`. Si el destino ya
   * existe, requiere `overwriteExisting`: en ese caso lo sustituye por
   * completo en lugar de fusionarlo, para evitar mezclas parciales.
   */
  async commitStaging(
    stagingDir: string,
    destinationPath: string,
    overwriteExisting: boolean
  ): Promise<void> {
    const exists = await this.destinationExists(destinationPath);
    if (exists && !overwriteExisting) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_DESTINATION_EXISTS,
        message: `El destino "${destinationPath}" ya existe; usa overwriteExisting para sustituirlo.`,
        origin: "destination",
        recoverable: true,
      });
    }

    try {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      if (exists) {
        const backupOfExisting = `${destinationPath}.import-replaced-${randomUUID()}`;
        await fs.rename(destinationPath, backupOfExisting);
        try {
          await fs.rename(stagingDir, destinationPath);
        } catch (err) {
          await fs.rename(backupOfExisting, destinationPath).catch(() => {});
          throw err;
        }
        await fs.rm(backupOfExisting, { recursive: true, force: true }).catch(() => {});
      } else {
        await fs.rename(stagingDir, destinationPath);
      }
    } catch (err) {
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_COPY_FAILED,
        origin: "copy",
        recoverable: true,
        message: `Fallo al promover la importación al destino final "${destinationPath}".`,
      });
    }
  }

  async rollbackStaging(stagingDir: string): Promise<void> {
    try {
      await fs.rm(stagingDir, { recursive: true, force: true });
    } catch (err) {
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_ROLLBACK_FAILED,
        origin: "rollback",
        recoverable: false,
        message: `Fallo al revertir la carpeta de staging "${stagingDir}".`,
      });
    }
  }
}
