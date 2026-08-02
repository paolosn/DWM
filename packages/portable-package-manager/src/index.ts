export type {
  PackageEntryType,
  PackageSecurityLimits,
  PackageEntryMetadata,
  PackageManifestEntry,
  PackageManifest,
  PackageResourceSource,
  ConflictPolicy,
  PackageSelection,
  CreatePackageOptions,
  PackageProgressUpdate,
  CreatePackageResult,
  DryRunReport,
  ExtractPackageOptions,
  ExtractPackageResult,
  ValidationIssueKind,
  PackageValidationIssue,
  PackageValidationResult,
} from "./PortablePackageTypes.js";
export {
  PACKAGE_FORMAT_VERSION,
  DEFAULT_INTEGRITY_ALGORITHM,
  DEFAULT_SECURITY_LIMITS,
  isConflictPolicy,
} from "./PortablePackageTypes.js";

export {
  isSafePackageEntryPath,
  assertSafePackageEntryPath,
  normalizeEntryPath,
  resolveSafeExtractionPath,
  isWithinAllowedRoot,
} from "./PackagePathSafety.js";

export { hashBuffer, hashFile, computeContentHash } from "./PackageIntegrity.js";

export {
  MANIFEST_ENTRY_NAME,
  buildManifest,
  serializeManifest,
  checkManifestShape,
  sortEntriesDeterministically,
  type BuildManifestInput,
  type ManifestShapeCheck,
} from "./PackageManifest.js";

export {
  resolvePackageSelection,
  isEntrySelected,
  OPTIONAL_RESOURCE_IDS,
  SECRETS_RESOURCE_ID,
  type ResolveSelectionInput,
} from "./PackageSelection.js";

export {
  PackageWalker,
  type WalkedEntry,
  type WalkOptions,
  type WalkResult,
} from "./PackageWalker.js";
export { PackageBuilder, resourceSource } from "./PackageBuilder.js";
export { PackageReader, type PackageZipEntryInfo } from "./PackageReader.js";
export {
  PackageConflictResolver,
  type ConflictAction,
  type ConflictDecision,
} from "./PackageConflictResolver.js";
export { PackageExtractor } from "./PackageExtractor.js";
export { PackageValidator } from "./PackageValidator.js";
export {
  PortablePackageManager,
  type PortablePackageManagerOptions,
  type CreatePackageRequest,
} from "./PortablePackageManager.js";

export {
  PortablePackageError,
  createPortablePackageError,
  type PortablePackageErrorOptions,
  type PortablePackageErrorOrigin,
} from "./errors/PortablePackageError.js";
export { PortablePackageErrorCode } from "./errors/PortablePackageErrorCode.js";
