/** Versión del formato de paquete que este módulo produce y sabe leer. Un paquete con `formatVersion` distinto se trata como potencialmente incompatible. */
export const PACKAGE_FORMAT_VERSION = "1.0.0";

/** Algoritmo de integridad usado por defecto para cada entrada y para el hash de contenido estable del paquete completo. */
export const DEFAULT_INTEGRITY_ALGORITHM = "sha256";

export const DEFAULT_SECURITY_LIMITS: PackageSecurityLimits = {
  maxEntries: 200_000,
  maxEntryBytes: 5 * 1024 * 1024 * 1024, // 5 GiB por fichero individual
  maxTotalBytes: 20 * 1024 * 1024 * 1024, // 20 GiB en total
  maxCompressionRatio: 200,
};

/** Tipo de una entrada dentro del paquete. Los symlinks nunca se preservan como tales: se deniegan (fuera del origen permitido) o se copian por contenido (dentro del origen permitido) — ver `PackageWalker`. */
export type PackageEntryType = "file" | "directory";

export interface PackageSecurityLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  /** Relación máxima admitida entre tamaño descomprimido y comprimido de una entrada, para detectar bombas ZIP. */
  readonly maxCompressionRatio: number;
}

/** Metadatos seguros y opcionales de una entrada. Nunca incluye rutas absolutas ni nada específico de una sola máquina. */
export interface PackageEntryMetadata {
  readonly [key: string]: string | number | boolean;
}

/** Una entrada del manifiesto: siempre una ruta relativa con separadores `/`, nunca una ruta absoluta. */
export interface PackageManifestEntry {
  readonly relativePath: string;
  readonly type: PackageEntryType;
  readonly size: number;
  readonly integrity?: string;
  readonly executable?: boolean;
  readonly mtimeMs?: number;
  readonly metadata?: PackageEntryMetadata;
}

/** Manifiesto versionado y completo de un paquete portable. */
export interface PackageManifest {
  readonly formatVersion: string;
  readonly packageId: string;
  readonly createdAt: string;
  readonly dwmVersion: string;
  readonly sourcePlatform: string;
  readonly workspaceId?: string;
  readonly entries: readonly PackageManifestEntry[];
  readonly totalFiles: number;
  readonly totalDirectories: number;
  readonly totalBytes: number;
  readonly excludedPatterns: readonly string[];
  readonly includedOptionalResources: readonly string[];
  readonly integrityAlgorithm: string;
  /** Hash de contenido estable de todo el paquete (independiente de `createdAt`), usado para reproducibilidad. */
  readonly contentHash: string;
  readonly packageMetadata?: PackageEntryMetadata;
}

/** Una fuente de recurso a incluir: una carpeta real del disco que se mapea dentro del paquete bajo `id/`. */
export interface PackageResourceSource {
  readonly id: string;
  readonly absolutePath: string;
  /** Si es `true` y la carpeta no existe, se omite en silencio (no es un error). */
  readonly optional: boolean;
}

/** Catálogo cerrado de políticas de conflicto al extraer. El comportamiento por defecto es `"fail"`; `"overwrite"` debe pedirse siempre de forma explícita. */
export type ConflictPolicy = "fail" | "skip" | "overwrite";

export interface PackageSelection {
  /** Fuentes de recurso ya resueltas a incluir (tras aplicar inclusión/exclusión por id). */
  readonly sources: readonly PackageResourceSource[];
  readonly excludePatterns: readonly string[];
  readonly includePatterns: readonly string[];
  readonly includedOptionalResources: readonly string[];
  readonly includeSecrets: boolean;
  readonly includeHidden: boolean;
}

export interface CreatePackageOptions {
  readonly destinationZipPath: string;
  readonly selection: PackageSelection;
  readonly packageId?: string;
  readonly workspaceId?: string;
  readonly dwmVersion?: string;
  readonly packageMetadata?: PackageEntryMetadata;
  readonly securityLimits?: Partial<PackageSecurityLimits>;
  readonly signal?: AbortSignal;
  onProgress?(update: PackageProgressUpdate): void | Promise<void>;
}

export interface PackageProgressUpdate {
  readonly phase: "scanning" | "hashing" | "writing" | "extracting" | "validating";
  readonly entriesProcessed: number;
  readonly entriesTotal: number;
  readonly currentEntry?: string;
}

/** Resultado de una creación real (no dry-run) de paquete. */
export interface CreatePackageResult {
  readonly manifest: PackageManifest;
  readonly zipPath: string;
  readonly warnings: readonly string[];
}

/** Informe de una operación en modo dry-run: nunca escribe ni extrae nada. */
export interface DryRunReport {
  readonly included: readonly PackageManifestEntry[];
  readonly excluded: readonly { relativePath: string; reason: string }[];
  readonly estimatedBytes: number;
  readonly conflicts: readonly { relativePath: string; policy: ConflictPolicy }[];
  readonly warnings: readonly string[];
  readonly destination: string;
  readonly plannedActions: readonly string[];
}

export interface ExtractPackageOptions {
  readonly zipPath: string;
  readonly destinationDir: string;
  readonly conflictPolicy?: ConflictPolicy;
  readonly dryRun?: boolean;
  readonly securityLimits?: Partial<PackageSecurityLimits>;
  readonly signal?: AbortSignal;
  onProgress?(update: PackageProgressUpdate): void | Promise<void>;
}

export interface ExtractPackageResult {
  readonly destinationDir: string;
  readonly filesWritten: number;
  readonly filesSkipped: number;
  readonly warnings: readonly string[];
}

export type ValidationIssueKind =
  | "missing-file"
  | "modified-file"
  | "extra-file"
  | "invalid-manifest"
  | "incompatible-version"
  | "unsafe-path";

export interface PackageValidationIssue {
  readonly kind: ValidationIssueKind;
  readonly relativePath?: string;
  readonly message: string;
}

export interface PackageValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PackageValidationIssue[];
}

export function isConflictPolicy(value: unknown): value is ConflictPolicy {
  return value === "fail" || value === "skip" || value === "overwrite";
}
