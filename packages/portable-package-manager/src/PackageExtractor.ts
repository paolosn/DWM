import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { PackageReader } from "./PackageReader.js";
import { PackageConflictResolver } from "./PackageConflictResolver.js";
import { resolveSafeExtractionPath } from "./PackagePathSafety.js";
import { PACKAGE_FORMAT_VERSION, DEFAULT_SECURITY_LIMITS } from "./PortablePackageTypes.js";
import type {
  DryRunReport,
  ExtractPackageOptions,
  ExtractPackageResult,
  PackageManifest,
  PackageSecurityLimits,
} from "./PortablePackageTypes.js";
import { PortablePackageErrorCode } from "./errors/PortablePackageErrorCode.js";
import { createPortablePackageError, PortablePackageError } from "./errors/PortablePackageError.js";

const ZIP_BOMB_RATIO_MIN_BYTES = 1_000_000;

/**
 * Extrae un paquete portable a un destino de forma segura: valida la
 * compatibilidad del manifiesto, protege contra Zip Slip y bombas ZIP,
 * aplica la política de conflicto pedida (nunca sobrescribe en
 * silencio) y solo mueve ficheros al destino final tras extraer todo
 * con éxito a una carpeta de preparación temporal, que se elimina en
 * cualquier caso — éxito, error o cancelación.
 */
export class PackageExtractor {
  constructor(
    private readonly reader: PackageReader = new PackageReader(),
    private readonly conflictResolver: PackageConflictResolver = new PackageConflictResolver()
  ) {}

  /** Extrae el paquete de verdad. Nunca aceptará `options.dryRun: true` — usa `planDryRun()` para eso. */
  async extract(options: ExtractPackageOptions): Promise<ExtractPackageResult> {
    const result = await this.run({ ...options, dryRun: false });
    return result as ExtractPackageResult;
  }

  /** Informa de lo que haría `extract()` con las mismas opciones, sin escribir ni mover nada. */
  async planDryRun(options: ExtractPackageOptions): Promise<DryRunReport> {
    const result = await this.run({ ...options, dryRun: true });
    return result as DryRunReport;
  }

  private async run(options: ExtractPackageOptions): Promise<ExtractPackageResult | DryRunReport> {
    const policy = options.conflictPolicy ?? "fail";
    const limits = { ...DEFAULT_SECURITY_LIMITS, ...options.securityLimits };
    const manifest = await this.reader.readManifest(options.zipPath);
    this.assertCompatible(manifest);
    await this.assertWithinLimits(options.zipPath, manifest, limits);

    const decisions = await this.conflictResolver.resolve(
      options.destinationDir,
      manifest.entries,
      policy
    );
    const conflicting = decisions.filter((d) => d.exists);

    if (options.dryRun) {
      return this.buildDryRunReport(options, manifest, conflicting, policy);
    }

    if (policy === "fail" && conflicting.length > 0) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_CONFLICT,
        message: `El destino ya contiene ${conflicting.length} fichero(s) y la política de conflicto es "fail": ${conflicting
          .slice(0, 5)
          .map((c) => c.relativePath)
          .join(", ")}${conflicting.length > 5 ? ", ..." : ""}.`,
        origin: "conflict",
        recoverable: true,
      });
    }

    const decisionByPath = new Map(decisions.map((d) => [d.relativePath, d]));
    const stagingDir = path.join(
      path.dirname(path.resolve(options.destinationDir)),
      `.dwm-ppm-staging-${randomUUID()}`
    );

    let filesWritten = 0;
    let filesSkipped = 0;
    const warnings: string[] = [
      ...(manifest.entries.length === 0 ? ["El paquete no contiene entradas."] : []),
    ];

    try {
      await fs.mkdir(stagingDir, { recursive: true });
      const zip = await this.reader.open(options.zipPath);

      let processed = 0;
      for (const entry of manifest.entries) {
        if (options.signal?.aborted) {
          throw createPortablePackageError({
            code: PortablePackageErrorCode.PACKAGE_CANCELLED,
            message: "La extracción del paquete se canceló.",
            origin: "extractor",
            recoverable: true,
          });
        }

        if (entry.type === "directory") {
          await fs.mkdir(resolveSafeExtractionPath(options.destinationDir, entry.relativePath), {
            recursive: true,
          });
          continue;
        }

        const decision = decisionByPath.get(entry.relativePath);
        if (decision?.action === "skip") {
          filesSkipped += 1;
          continue;
        }

        const zipEntry = zip.getEntry(entry.relativePath);
        if (!zipEntry) {
          throw createPortablePackageError({
            code: PortablePackageErrorCode.PACKAGE_EXTRACT_FAILED,
            message: `El fichero declarado "${entry.relativePath}" no está presente en el paquete.`,
            origin: "extractor",
            recoverable: true,
          });
        }

        const stagedPath = resolveSafeExtractionPath(stagingDir, entry.relativePath);
        await fs.mkdir(path.dirname(stagedPath), { recursive: true });
        await fs.writeFile(stagedPath, zipEntry.getData());
        if (entry.executable) await fs.chmod(stagedPath, 0o755);

        const finalPath = resolveSafeExtractionPath(options.destinationDir, entry.relativePath);
        await fs.mkdir(path.dirname(finalPath), { recursive: true });
        await fs.rename(stagedPath, finalPath);
        filesWritten += 1;

        processed += 1;
        await options.onProgress?.({
          phase: "extracting",
          entriesProcessed: processed,
          entriesTotal: manifest.entries.length,
          currentEntry: entry.relativePath,
        });
      }

      return { destinationDir: options.destinationDir, filesWritten, filesSkipped, warnings };
    } catch (err) {
      if (err instanceof PortablePackageError) throw err;
      throw PortablePackageError.wrap(err, {
        code: PortablePackageErrorCode.PACKAGE_EXTRACT_FAILED,
        origin: "extractor",
        recoverable: true,
        message: `Fallo al extraer el paquete "${options.zipPath}" en "${options.destinationDir}".`,
      });
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private buildDryRunReport(
    options: ExtractPackageOptions,
    manifest: PackageManifest,
    conflicting: Awaited<ReturnType<PackageConflictResolver["resolve"]>>,
    policy: NonNullable<ExtractPackageOptions["conflictPolicy"]>
  ): DryRunReport {
    const conflictSet = new Set(conflicting.map((c) => c.relativePath));
    return {
      included: manifest.entries.filter(
        (entry) =>
          entry.type === "directory" ||
          !conflictSet.has(entry.relativePath) ||
          policy === "overwrite"
      ),
      excluded: manifest.entries
        .filter((entry) => conflictSet.has(entry.relativePath) && policy === "skip")
        .map((entry) => ({ relativePath: entry.relativePath, reason: "conflict-skip" })),
      estimatedBytes: manifest.totalBytes,
      conflicts: conflicting.map((c) => ({ relativePath: c.relativePath, policy })),
      warnings: [],
      destination: options.destinationDir,
      plannedActions: [
        `Se extraerían ${manifest.totalFiles} fichero(s) y ${manifest.totalDirectories} carpeta(s) en "${options.destinationDir}" (política de conflicto: "${policy}").`,
      ],
    };
  }

  private assertCompatible(manifest: PackageManifest): void {
    if (manifest.formatVersion !== PACKAGE_FORMAT_VERSION) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_INCOMPATIBLE_VERSION,
        message: `La versión de formato del paquete ("${manifest.formatVersion}") no es compatible con la soportada ("${PACKAGE_FORMAT_VERSION}").`,
        origin: "validation",
        recoverable: true,
      });
    }
  }

  private async assertWithinLimits(
    zipPath: string,
    manifest: PackageManifest,
    limits: PackageSecurityLimits
  ): Promise<void> {
    if (manifest.entries.length > limits.maxEntries) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
        message: `El paquete declara ${manifest.entries.length} entradas, por encima del límite permitido (${limits.maxEntries}).`,
        origin: "limits",
        recoverable: true,
      });
    }
    if (manifest.totalBytes > limits.maxTotalBytes) {
      throw createPortablePackageError({
        code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
        message: `El paquete declara ${manifest.totalBytes} bytes en total, por encima del límite permitido (${limits.maxTotalBytes}).`,
        origin: "limits",
        recoverable: true,
      });
    }

    const zipEntries = await this.reader.listEntries(zipPath);
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      if (entry.uncompressedSize > limits.maxEntryBytes) {
        throw createPortablePackageError({
          code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
          message: `La entrada "${entry.relativePath}" (${entry.uncompressedSize} bytes) supera el límite máximo por entrada (${limits.maxEntryBytes} bytes).`,
          origin: "limits",
          recoverable: true,
        });
      }
      if (entry.uncompressedSize < ZIP_BOMB_RATIO_MIN_BYTES) continue;
      const ratio =
        entry.compressedSize > 0 ? entry.uncompressedSize / entry.compressedSize : Infinity;
      if (ratio > limits.maxCompressionRatio) {
        throw createPortablePackageError({
          code: PortablePackageErrorCode.PACKAGE_LIMIT_EXCEEDED,
          message: `La entrada "${entry.relativePath}" tiene una relación de compresión sospechosa (${ratio.toFixed(1)}x), posible bomba ZIP.`,
          origin: "limits",
          recoverable: true,
        });
      }
    }
  }
}
