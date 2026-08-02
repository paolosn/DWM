import { PackageReader } from "./PackageReader.js";
import { MANIFEST_ENTRY_NAME, checkManifestShape } from "./PackageManifest.js";
import { hashBuffer } from "./PackageIntegrity.js";
import { PACKAGE_FORMAT_VERSION } from "./PortablePackageTypes.js";
import type {
  PackageManifest,
  PackageValidationIssue,
  PackageValidationResult,
} from "./PortablePackageTypes.js";
import { PortablePackageError } from "./errors/PortablePackageError.js";

/**
 * Valida un paquete ya construido: forma del manifiesto, compatibilidad
 * de `formatVersion`, y coincidencia exacta entre lo declarado en el
 * manifiesto y lo que realmente contiene el ZIP — detecta ficheros
 * ausentes, modificados (hash distinto) y añadidos sin declarar. Nunca
 * extrae nada a disco: todo se lee a través de `PackageReader`.
 */
export class PackageValidator {
  constructor(private readonly reader: PackageReader = new PackageReader()) {}

  async validate(zipPath: string): Promise<PackageValidationResult> {
    let manifest: PackageManifest;
    try {
      manifest = await this.reader.readManifest(zipPath);
    } catch (err) {
      const message = err instanceof PortablePackageError ? err.message : String(err);
      return { valid: false, issues: [{ kind: "invalid-manifest", message }] };
    }

    const shape = checkManifestShape(manifest);
    const issues: PackageValidationIssue[] = shape.valid
      ? []
      : [{ kind: "invalid-manifest", message: `Manifiesto inválido: ${shape.issues.join("; ")}` }];

    if (manifest.formatVersion !== PACKAGE_FORMAT_VERSION) {
      issues.push({
        kind: "incompatible-version",
        message: `La versión de formato "${manifest.formatVersion}" no es compatible con la soportada "${PACKAGE_FORMAT_VERSION}".`,
      });
    }

    const zipEntries = await this.reader.listEntries(zipPath);
    const zipFilePaths = new Set(
      zipEntries
        .filter((e) => !e.isDirectory && e.relativePath !== MANIFEST_ENTRY_NAME)
        .map((e) => e.relativePath)
    );
    const declaredFilePaths = new Set(
      manifest.entries.filter((e) => e.type === "file").map((e) => e.relativePath)
    );

    for (const entry of manifest.entries) {
      if (entry.type !== "file") continue;
      if (!zipFilePaths.has(entry.relativePath)) {
        issues.push({
          kind: "missing-file",
          relativePath: entry.relativePath,
          message: `El fichero declarado "${entry.relativePath}" no está presente en el paquete.`,
        });
        continue;
      }
      if (entry.integrity) {
        const algorithm = entry.integrity.split(":")[0] ?? "sha256";
        const content = await this.reader.readEntryContent(zipPath, entry.relativePath);
        const actualHash = content ? hashBuffer(content, algorithm) : undefined;
        if (actualHash !== entry.integrity) {
          issues.push({
            kind: "modified-file",
            relativePath: entry.relativePath,
            message: `El fichero "${entry.relativePath}" no coincide con el hash declarado en el manifiesto.`,
          });
        }
      }
    }

    for (const zipPathEntry of zipFilePaths) {
      if (!declaredFilePaths.has(zipPathEntry)) {
        issues.push({
          kind: "extra-file",
          relativePath: zipPathEntry,
          message: `El fichero "${zipPathEntry}" está presente en el paquete pero no está declarado en el manifiesto.`,
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }
}
