import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import AdmZip from "adm-zip";
import { PackageWalker, type WalkedEntry } from "./PackageWalker.js";
import { isEntrySelected } from "./PackageSelection.js";
import { hashFile } from "./PackageIntegrity.js";
import { buildManifest, serializeManifest, MANIFEST_ENTRY_NAME } from "./PackageManifest.js";
import { normalizeEntryPath } from "./PackagePathSafety.js";
import {
  DEFAULT_SECURITY_LIMITS,
  type CreatePackageOptions,
  type CreatePackageResult,
  type DryRunReport,
  type PackageManifestEntry,
  type PackageResourceSource,
  type PackageSecurityLimits,
  type PackageSelection,
} from "./PortablePackageTypes.js";
import { PortablePackageErrorCode } from "./errors/PortablePackageErrorCode.js";
import { PortablePackageError, createPortablePackageError } from "./errors/PortablePackageError.js";

const DIRECTORY_ATTR = (0o755 << 16) | 0x10;
const FILE_ATTR = (0o644 << 16) >>> 0;
const EXECUTABLE_FILE_ATTR = (0o755 << 16) >>> 0;

interface CollectedEntry {
  readonly manifestEntry: PackageManifestEntry;
  readonly absolutePath?: string;
}

interface CollectResult {
  readonly entries: CollectedEntry[];
  readonly excluded: { relativePath: string; reason: string }[];
  readonly warnings: string[];
  readonly totalBytes: number;
}

/**
 * Construye paquetes portables completos: recorre cada fuente de la
 * selección, aplica patrones de inclusión/exclusión, calcula hashes por
 * fichero, aplica límites de seguridad y escribe el ZIP final (o
 * produce un informe dry-run sin escribir nada). Nunca modifica los
 * orígenes: solo los lee. Escribe siempre primero a un fichero temporal
 * junto al destino y solo lo renombra al nombre final si todo el
 * proceso termina con éxito — ante cualquier error o cancelación, el
 * temporal se elimina y el destino nunca queda a medias.
 */
export class PackageBuilder {
  private readonly walker = new PackageWalker();

  async build(
    dwmVersion: string,
    sourcePlatform: string,
    options: CreatePackageOptions
  ): Promise<CreatePackageResult> {
    const limits = { ...DEFAULT_SECURITY_LIMITS, ...options.securityLimits };
    const collected = await this.collect(
      options.selection,
      limits,
      options.signal,
      options.onProgress
    );

    const manifest = buildManifest({
      entries: collected.entries.map((e) => e.manifestEntry),
      excludedPatterns: options.selection.excludePatterns,
      includedOptionalResources: options.selection.includedOptionalResources,
      dwmVersion,
      sourcePlatform,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(options.packageId ? { packageId: options.packageId } : {}),
      ...(options.packageMetadata ? { packageMetadata: options.packageMetadata } : {}),
    });

    const tempZipPath = `${options.destinationZipPath}.${randomUUID()}.tmp`;
    try {
      await this.writeZip(tempZipPath, collected.entries, manifest, options.signal);
      await fs.mkdir(path.dirname(options.destinationZipPath), { recursive: true });
      await fs.rename(tempZipPath, options.destinationZipPath);
    } catch (err) {
      await fs.unlink(tempZipPath).catch(() => {});
      if (err instanceof PortablePackageError) throw err;
      throw PortablePackageError.wrap(err, {
        code: PortablePackageErrorCode.PACKAGE_BUILD_FAILED,
        origin: "builder",
        recoverable: true,
        message: `Fallo al construir el paquete en "${options.destinationZipPath}".`,
      });
    }

    return { manifest, zipPath: options.destinationZipPath, warnings: collected.warnings };
  }

  async planDryRun(
    dwmVersion: string,
    sourcePlatform: string,
    options: CreatePackageOptions
  ): Promise<DryRunReport> {
    const limits = { ...DEFAULT_SECURITY_LIMITS, ...options.securityLimits };
    const collected = await this.collect(
      options.selection,
      limits,
      options.signal,
      options.onProgress
    );
    void dwmVersion;
    void sourcePlatform;

    return {
      included: collected.entries.map((e) => e.manifestEntry),
      excluded: collected.excluded,
      estimatedBytes: collected.totalBytes,
      conflicts: [],
      warnings: collected.warnings,
      destination: options.destinationZipPath,
      plannedActions: [
        `Se escribiría un ZIP en "${options.destinationZipPath}" con ${collected.entries.length} entradas (${collected.totalBytes} bytes).`,
      ],
    };
  }

  private async collect(
    selection: PackageSelection,
    limits: PackageSecurityLimits,
    signal: AbortSignal | undefined,
    onProgress: CreatePackageOptions["onProgress"]
  ): Promise<CollectResult> {
    const entries: CollectedEntry[] = [];
    const excluded: { relativePath: string; reason: string }[] = [];
    const warnings: string[] = [];
    let totalBytes = 0;
    let processed = 0;

    for (const source of selection.sources) {
      if (signal?.aborted) {
        throw createPortablePackageError({
          code: PortablePackageErrorCode.PACKAGE_CANCELLED,
          message: "La creación del paquete se canceló.",
          origin: "builder",
          recoverable: true,
        });
      }

      const sourceExists = await fs
        .stat(source.absolutePath)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (!sourceExists) {
        if (!source.optional) {
          warnings.push(`Recurso requerido "${source.id}" no encontrado; se omite.`);
        }
        continue;
      }

      const walkResult = await this.walker.walk(source.absolutePath, {
        includeHidden: selection.includeHidden,
        ...(signal ? { signal } : {}),
      });
      warnings.push(...walkResult.warnings);

      for (const walked of walkResult.entries) {
        const archivePath = `${source.id}/${normalizeEntryPath(walked.relativePath)}`;
        if (!isEntrySelected(archivePath, selection)) {
          excluded.push({ relativePath: archivePath, reason: "excluded-by-pattern" });
          continue;
        }

        entries.push(await this.toCollectedEntry(archivePath, walked, limits));
        totalBytes += walked.size;

        if (entries.length > limits.maxEntries) {
          throw createPortablePackageError({
            code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
            message: `El paquete supera el número máximo de entradas permitido (${limits.maxEntries}).`,
            origin: "limits",
            recoverable: true,
          });
        }
        if (totalBytes > limits.maxTotalBytes) {
          throw createPortablePackageError({
            code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
            message: `El paquete supera el tamaño total máximo permitido (${limits.maxTotalBytes} bytes).`,
            origin: "limits",
            recoverable: true,
          });
        }

        processed += 1;
        await onProgress?.({
          phase: "hashing",
          entriesProcessed: processed,
          entriesTotal: processed,
          currentEntry: archivePath,
        });
      }
    }

    return { entries, excluded, warnings, totalBytes };
  }

  private async toCollectedEntry(
    archivePath: string,
    walked: WalkedEntry,
    limits: PackageSecurityLimits
  ): Promise<CollectedEntry> {
    if (walked.type === "directory") {
      return {
        manifestEntry: {
          relativePath: archivePath,
          type: "directory",
          size: 0,
          mtimeMs: walked.mtimeMs,
        },
      };
    }

    if (walked.size > limits.maxEntryBytes) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
        message: `El fichero "${archivePath}" (${walked.size} bytes) supera el límite máximo por entrada (${limits.maxEntryBytes} bytes).`,
        origin: "limits",
        recoverable: true,
      });
    }

    const integrity = await hashFile(walked.absolutePath);
    return {
      manifestEntry: {
        relativePath: archivePath,
        type: "file",
        size: walked.size,
        integrity,
        executable: walked.executable,
        mtimeMs: walked.mtimeMs,
      },
      absolutePath: walked.absolutePath,
    };
  }

  private async writeZip(
    tempZipPath: string,
    entries: readonly CollectedEntry[],
    manifest: ReturnType<typeof buildManifest>,
    signal: AbortSignal | undefined
  ): Promise<void> {
    const zip = new AdmZip();
    zip.addFile(
      MANIFEST_ENTRY_NAME,
      Buffer.from(serializeManifest(manifest), "utf-8"),
      "",
      FILE_ATTR
    );

    for (const entry of entries) {
      if (signal?.aborted) {
        throw createPortablePackageError({
          code: PortablePackageErrorCode.PACKAGE_CANCELLED,
          message: "La creación del paquete se canceló.",
          origin: "builder",
          recoverable: true,
        });
      }
      if (entry.manifestEntry.type === "directory") {
        zip.addFile(`${entry.manifestEntry.relativePath}/`, Buffer.alloc(0), "", DIRECTORY_ATTR);
        continue;
      }
      const content = await fs.readFile(entry.absolutePath!);
      const attr = entry.manifestEntry.executable ? EXECUTABLE_FILE_ATTR : FILE_ATTR;
      zip.addFile(entry.manifestEntry.relativePath, content, "", attr);
    }

    await fs.mkdir(path.dirname(tempZipPath), { recursive: true });
    await zip.writeZipPromise(tempZipPath, { overwrite: true });
  }
}

export function resourceSource(
  id: string,
  absolutePath: string,
  optional: boolean = false
): PackageResourceSource {
  return { id, absolutePath, optional };
}
