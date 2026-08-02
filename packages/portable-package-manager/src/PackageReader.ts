import { promises as fs } from "node:fs";
import AdmZip from "adm-zip";
import { MANIFEST_ENTRY_NAME } from "./PackageManifest.js";
import { checkManifestShape } from "./PackageManifest.js";
import type { PackageManifest } from "./PortablePackageTypes.js";
import { PortablePackageErrorCode } from "./errors/PortablePackageErrorCode.js";
import { createPortablePackageError, PortablePackageError } from "./errors/PortablePackageError.js";

export interface PackageZipEntryInfo {
  readonly relativePath: string;
  readonly isDirectory: boolean;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

/**
 * Lee el contenido de un paquete ZIP sin extraer nada a disco: ni el
 * listado de entradas ni la lectura del manifiesto escriben ningún
 * fichero. Es la única forma en que `PackageValidator` y
 * `PackageExtractor` acceden al contenido de un ZIP — nunca abren
 * `AdmZip` directamente.
 */
export class PackageReader {
  async open(zipPath: string): Promise<AdmZip> {
    await this.assertFileExists(zipPath);
    try {
      return new AdmZip(zipPath);
    } catch (err) {
      throw PortablePackageError.wrap(err, {
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        origin: "reader",
        recoverable: true,
        message: `El paquete "${zipPath}" no se pudo leer o está corrupto.`,
      });
    }
  }

  async listEntries(zipPath: string): Promise<PackageZipEntryInfo[]> {
    const zip = await this.open(zipPath);
    return zip.getEntries().map((entry) => ({
      relativePath: entry.entryName.replace(/\/+$/, ""),
      isDirectory: entry.isDirectory,
      compressedSize: entry.header.compressedSize,
      uncompressedSize: entry.header.size,
    }));
  }

  async readManifest(zipPath: string): Promise<PackageManifest> {
    const zip = await this.open(zipPath);
    const manifestEntry = zip.getEntry(MANIFEST_ENTRY_NAME);
    if (!manifestEntry) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
        message: `El paquete "${zipPath}" no contiene un manifiesto ("${MANIFEST_ENTRY_NAME}").`,
        origin: "reader",
        recoverable: true,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestEntry.getData().toString("utf-8"));
    } catch (err) {
      throw PortablePackageError.wrap(err, {
        code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
        origin: "reader",
        recoverable: true,
        message: `El manifiesto del paquete "${zipPath}" no es JSON válido.`,
      });
    }

    const shape = checkManifestShape(parsed);
    if (!shape.valid) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_INVALID_MANIFEST,
        message: `El manifiesto del paquete "${zipPath}" es inválido: ${shape.issues.join("; ")}`,
        origin: "reader",
        recoverable: true,
      });
    }
    return parsed as PackageManifest;
  }

  async readEntryContent(zipPath: string, relativePath: string): Promise<Buffer | undefined> {
    const zip = await this.open(zipPath);
    const entry = zip.getEntry(relativePath);
    if (!entry) return undefined;
    return entry.getData();
  }

  private async assertFileExists(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error("not a file");
    } catch {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_READ_FAILED,
        message: `No existe ningún paquete en "${filePath}".`,
        origin: "reader",
        recoverable: true,
      });
    }
  }
}
