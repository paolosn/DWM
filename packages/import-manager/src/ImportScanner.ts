import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { isExcluded } from "@dwm/workspace";
import type { ImportEntry, ImportScanResult, ImportSourceType } from "./ImportTypes.js";
import { isHiddenRelativePath } from "./ImportTypes.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { ImportError, createImportError } from "./errors/ImportError.js";

/**
 * Escanea un origen (carpeta, ZIP o raíz de un Workspace DWM anterior) sin
 * escribir nada en disco ni interpretar su contenido: solo enumera lo que
 * hay físicamente. No clasifica, no indexa, no analiza — eso es
 * responsabilidad de un módulo posterior (PSN Adapter). Nunca omite
 * ficheros ocultos salvo que coincidan explícitamente con
 * `excludePatterns`.
 */
export class ImportScanner {
  async scan(
    sourceType: ImportSourceType,
    sourcePath: string,
    excludePatterns: readonly string[] = []
  ): Promise<ImportScanResult> {
    if (sourceType === "zip") {
      return this.scanZip(sourcePath, excludePatterns);
    }
    return this.scanFolder(sourcePath, excludePatterns);
  }

  async scanFolder(
    rootPath: string,
    excludePatterns: readonly string[] = []
  ): Promise<ImportScanResult> {
    await this.assertFolderExists(rootPath);

    const entries: ImportEntry[] = [];
    const directories = new Set<string>();

    try {
      await this.walk(rootPath, "", excludePatterns, entries, directories);
    } catch (err) {
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_SCAN_FAILED,
        origin: "scan",
        recoverable: true,
        message: `Fallo al escanear el origen en "${rootPath}".`,
      });
    }

    return this.toResult(entries, directories);
  }

  private async scanZip(
    zipPath: string,
    excludePatterns: readonly string[]
  ): Promise<ImportScanResult> {
    await this.assertFileExists(zipPath);

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipPath);
    } catch (err) {
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_SCAN_FAILED,
        origin: "scan",
        recoverable: true,
        message: `El fichero ZIP "${zipPath}" no se pudo leer o está corrupto.`,
      });
    }

    const entries: ImportEntry[] = [];
    const directories = new Set<string>();

    for (const zipEntry of zip.getEntries()) {
      const relativePath = zipEntry.entryName.replace(/\\/g, "/").replace(/\/+$/, "");
      if (relativePath.length === 0) continue;
      this.assertSafeRelativePath(relativePath, zipPath);

      const dir = path.posix.dirname(relativePath);
      if (dir !== ".") this.registerAncestorDirectories(dir, directories);

      if (zipEntry.isDirectory) {
        directories.add(relativePath);
        continue;
      }
      if (isExcluded(relativePath, excludePatterns)) continue;

      entries.push({
        relativePath,
        size: zipEntry.header.size,
        mtimeMs: zipEntry.header.time.getTime(),
        isHidden: isHiddenRelativePath(relativePath),
      });
    }

    return this.toResult(entries, directories);
  }

  private registerAncestorDirectories(dir: string, directories: Set<string>): void {
    const segments = dir.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      directories.add(current);
    }
  }

  /**
   * Rechaza cualquier ruta relativa que intente escapar de la carpeta de
   * destino (path traversal / Zip Slip): rutas absolutas (POSIX o unidad de
   * Windows) o con algún segmento `..`. Se aplica a toda entrada de ZIP
   * antes de registrarla, porque `entryName` es contenido del propio
   * fichero origen y no debe tratarse como de confianza.
   */
  private assertSafeRelativePath(relativePath: string, sourceDescription: string): void {
    const isAbsoluteUnix = relativePath.startsWith("/");
    const isAbsoluteWindows = /^[a-zA-Z]:[\\/]/.test(relativePath);
    if (isAbsoluteUnix || isAbsoluteWindows) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
        message: `La entrada "${relativePath}" de "${sourceDescription}" usa una ruta absoluta; se rechaza por seguridad (Zip Slip).`,
        origin: "scan",
        recoverable: false,
      });
    }
    if (relativePath.split("/").some((segment) => segment === "..")) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
        message: `La entrada "${relativePath}" de "${sourceDescription}" intenta salir de su carpeta (path traversal / Zip Slip); se rechaza por seguridad.`,
        origin: "scan",
        recoverable: false,
      });
    }
  }

  /**
   * Rechaza un symlink cuyo destino resuelto quede fuera de `rootPath`
   * (symlink peligroso): copiarlo recrearía, dentro del Workspace interno
   * de DWM, un enlace hacia un fichero fuera del origen importado.
   */
  private assertSafeSymlinkTarget(
    rootPath: string,
    absoluteLinkPath: string,
    symlinkTarget: string,
    relativePath: string
  ): void {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.isAbsolute(symlinkTarget)
      ? path.resolve(symlinkTarget)
      : path.resolve(path.dirname(absoluteLinkPath), symlinkTarget);
    const relativeToRoot = path.relative(resolvedRoot, resolvedTarget);
    const escapesRoot =
      relativeToRoot === ".." ||
      relativeToRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToRoot);
    if (escapesRoot) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_UNSAFE_PATH,
        message: `El symlink "${relativePath}" apunta fuera del origen ("${symlinkTarget}"); se rechaza por seguridad (symlink peligroso).`,
        origin: "scan",
        recoverable: false,
      });
    }
  }

  private async walk(
    rootPath: string,
    relativeDir: string,
    excludePatterns: readonly string[],
    entries: ImportEntry[],
    directories: Set<string>
  ): Promise<void> {
    const absoluteDir = path.join(rootPath, relativeDir);
    const dirEntries = await fs.readdir(absoluteDir, { withFileTypes: true });

    for (const dirEntry of dirEntries) {
      const relativePath = relativeDir ? `${relativeDir}/${dirEntry.name}` : dirEntry.name;

      if (dirEntry.isDirectory()) {
        if (isExcluded(`${relativePath}/`, excludePatterns)) continue;
        directories.add(relativePath);
        await this.walk(rootPath, relativePath, excludePatterns, entries, directories);
        continue;
      }

      if (isExcluded(relativePath, excludePatterns)) continue;

      const absolutePath = path.join(rootPath, relativePath);
      const lstat = await fs.lstat(absolutePath);

      if (dirEntry.isSymbolicLink()) {
        const symlinkTarget = await fs.readlink(absolutePath);
        this.assertSafeSymlinkTarget(rootPath, absolutePath, symlinkTarget, relativePath);
        entries.push({
          relativePath,
          size: lstat.size,
          mtimeMs: lstat.mtimeMs,
          isHidden: isHiddenRelativePath(relativePath),
          mode: lstat.mode,
          symlinkTarget,
        });
        continue;
      }

      if (dirEntry.isFile()) {
        entries.push({
          relativePath,
          size: lstat.size,
          mtimeMs: lstat.mtimeMs,
          isHidden: isHiddenRelativePath(relativePath),
          mode: lstat.mode,
        });
      }
    }
  }

  private toResult(entries: readonly ImportEntry[], directories: Set<string>): ImportScanResult {
    const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const sortedDirectories = [...directories].sort((a, b) => a.localeCompare(b));
    return {
      entries: sorted,
      directories: sortedDirectories,
      fileCount: sorted.length,
      directoryCount: sortedDirectories.length,
      signature: this.computeSignature(sorted),
      scannedAt: Date.now(),
    };
  }

  private computeSignature(entries: readonly ImportEntry[]): string {
    const hash = createHash("sha256");
    for (const entry of entries) {
      hash.update(`${entry.relativePath}:${entry.size}\n`);
    }
    return hash.digest("hex");
  }

  private async assertFolderExists(rootPath: string): Promise<void> {
    try {
      const stat = await fs.stat(rootPath);
      if (!stat.isDirectory()) {
        throw createImportError({
          code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
          message: `El origen "${rootPath}" no es una carpeta.`,
          origin: "source",
          recoverable: true,
        });
      }
    } catch (err) {
      if (err instanceof ImportError) throw err;
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
        origin: "source",
        recoverable: true,
        message: `No se encontró la carpeta origen "${rootPath}".`,
      });
    }
  }

  private async assertFileExists(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        throw createImportError({
          code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
          message: `El origen "${filePath}" no es un fichero.`,
          origin: "source",
          recoverable: true,
        });
      }
    } catch (err) {
      if (err instanceof ImportError) throw err;
      throw ImportError.wrap(err, {
        code: ImportErrorCode.IMPORT_SOURCE_NOT_FOUND,
        origin: "source",
        recoverable: true,
        message: `No se encontró el fichero ZIP origen "${filePath}".`,
      });
    }
  }
}
