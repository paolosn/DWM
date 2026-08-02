import { randomUUID } from "node:crypto";
import { computeContentHash } from "./PackageIntegrity.js";
import {
  DEFAULT_INTEGRITY_ALGORITHM,
  PACKAGE_FORMAT_VERSION,
  type PackageEntryMetadata,
  type PackageManifest,
  type PackageManifestEntry,
} from "./PortablePackageTypes.js";

export const MANIFEST_ENTRY_NAME = "dwm-package-manifest.json";

export interface BuildManifestInput {
  readonly entries: readonly PackageManifestEntry[];
  readonly excludedPatterns: readonly string[];
  readonly includedOptionalResources: readonly string[];
  readonly dwmVersion: string;
  readonly sourcePlatform: string;
  readonly workspaceId?: string;
  readonly packageId?: string;
  readonly packageMetadata?: PackageEntryMetadata;
  readonly integrityAlgorithm?: string;
}

/** Ordena las entradas de forma determinista (por ruta relativa, con separadores ya normalizados a "/"), para que el orden nunca dependa del sistema de ficheros de origen. */
export function sortEntriesDeterministically(
  entries: readonly PackageManifestEntry[]
): PackageManifestEntry[] {
  return [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Construye el `PackageManifest` completo a partir de las entradas ya
 * recogidas. Función pura: no toca el disco. `contentHash` se calcula
 * siempre sobre las entradas ya ordenadas deterministamente, así que es
 * estable frente al orden real de recorrido del sistema de ficheros.
 */
export function buildManifest(input: BuildManifestInput): PackageManifest {
  const sorted = sortEntriesDeterministically(input.entries);
  const integrityAlgorithm = input.integrityAlgorithm ?? DEFAULT_INTEGRITY_ALGORITHM;
  const totalFiles = sorted.filter((e) => e.type === "file").length;
  const totalDirectories = sorted.filter((e) => e.type === "directory").length;
  const totalBytes = sorted.reduce((sum, e) => sum + e.size, 0);

  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    packageId: input.packageId ?? randomUUID(),
    createdAt: new Date().toISOString(),
    dwmVersion: input.dwmVersion,
    sourcePlatform: input.sourcePlatform,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    entries: sorted,
    totalFiles,
    totalDirectories,
    totalBytes,
    excludedPatterns: input.excludedPatterns,
    includedOptionalResources: input.includedOptionalResources,
    integrityAlgorithm,
    contentHash: computeContentHash(sorted, integrityAlgorithm),
    ...(input.packageMetadata ? { packageMetadata: input.packageMetadata } : {}),
  };
}

export function serializeManifest(manifest: PackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export interface ManifestShapeCheck {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Valida únicamente la FORMA del manifiesto (campos obligatorios y sus tipos básicos), sin comparar contra el contenido real del paquete — eso es responsabilidad de `PackageValidator`. */
export function checkManifestShape(value: unknown): ManifestShapeCheck {
  const issues: string[] = [];
  if (typeof value !== "object" || value === null) {
    return { valid: false, issues: ["el manifiesto debe ser un objeto JSON."] };
  }
  const manifest = value as Partial<PackageManifest>;

  if (typeof manifest.formatVersion !== "string" || manifest.formatVersion.length === 0) {
    issues.push("formatVersion debe ser una cadena no vacía.");
  }
  if (typeof manifest.packageId !== "string" || manifest.packageId.length === 0) {
    issues.push("packageId debe ser una cadena no vacía.");
  }
  if (typeof manifest.createdAt !== "string" || Number.isNaN(Date.parse(manifest.createdAt))) {
    issues.push("createdAt debe ser una fecha ISO válida.");
  }
  if (typeof manifest.dwmVersion !== "string") {
    issues.push("dwmVersion debe ser una cadena.");
  }
  if (typeof manifest.sourcePlatform !== "string") {
    issues.push("sourcePlatform debe ser una cadena.");
  }
  if (!Array.isArray(manifest.entries)) {
    issues.push("entries debe ser un array.");
  } else {
    manifest.entries.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        issues.push(`entries[${index}] debe ser un objeto.`);
        return;
      }
      const e = entry as Partial<PackageManifestEntry>;
      if (typeof e.relativePath !== "string" || e.relativePath.length === 0) {
        issues.push(`entries[${index}].relativePath debe ser una cadena no vacía.`);
      }
      if (e.type !== "file" && e.type !== "directory") {
        issues.push(`entries[${index}].type debe ser "file" o "directory".`);
      }
      if (typeof e.size !== "number" || e.size < 0) {
        issues.push(`entries[${index}].size debe ser un número no negativo.`);
      }
    });
  }
  if (typeof manifest.totalFiles !== "number") issues.push("totalFiles debe ser un número.");
  if (typeof manifest.totalDirectories !== "number")
    issues.push("totalDirectories debe ser un número.");
  if (typeof manifest.totalBytes !== "number") issues.push("totalBytes debe ser un número.");
  if (!Array.isArray(manifest.excludedPatterns)) issues.push("excludedPatterns debe ser un array.");
  if (!Array.isArray(manifest.includedOptionalResources)) {
    issues.push("includedOptionalResources debe ser un array.");
  }
  if (typeof manifest.integrityAlgorithm !== "string") {
    issues.push("integrityAlgorithm debe ser una cadena.");
  }
  if (typeof manifest.contentHash !== "string") issues.push("contentHash debe ser una cadena.");

  return { valid: issues.length === 0, issues };
}
