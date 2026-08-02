import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";

/**
 * Expresión regular oficial de semver (semver.org), usada para validar
 * `version` y `contractVersion` de todo módulo o adaptador (README §12,
 * regla K). Solo se admite un formato semántico correcto: núcleo
 * MAJOR.MINOR.PATCH obligatorio, con pre-release y metadatos de build
 * opcionales.
 */
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidSemver(version: string): boolean {
  return SEMVER_REGEX.test(version);
}

function majorOf(version: string): number {
  // Precondición: `version` ya ha sido validada con isValidSemver().
  const major = version.split(".")[0];
  return Number.parseInt(major!, 10);
}

/**
 * Regla de compatibilidad de contrato (ADR-001 §19, README §12 regla K):
 * misma versión MAYOR ⇒ compatible; versión MAYOR distinta ⇒ incompatible.
 * Ambas versiones deben ser semver válido; la validación de formato se hace
 * antes de invocar esta función (ver `assertValidSemver`).
 */
export function isContractCompatible(coreVersion: string, componentVersion: string): boolean {
  return majorOf(coreVersion) === majorOf(componentVersion);
}

export function assertValidSemver(
  value: string,
  fieldName: string,
  origin: "registry-module" | "registry-adapter"
): void {
  if (!isValidSemver(value)) {
    throw new DWMError({
      code: ErrorCode.INVALID_SEMANTIC_VERSION,
      message: `El campo "${fieldName}" ("${value}") no es una versión semántica válida (MAJOR.MINOR.PATCH).`,
      origin,
      recoverable: true,
    });
  }
}

interface IdentityLike {
  id: string;
  version: string;
  contractVersion: string;
}

interface AdapterIdentityLike extends IdentityLike {
  subjectId: string;
}

/**
 * Valida los campos obligatorios de identidad de un módulo (README §12,
 * regla D), antes de tocar ningún registro interno.
 */
export function assertValidModuleIdentity(module: IdentityLike): void {
  assertNonEmptyTrimmed(module?.id, "id", "CORE_MODULE_INVALID_IDENTITY_ID", "registry-module");
  assertPresent(module?.version, "version", "registry-module", ErrorCode.MODULE_INVALID_IDENTITY);
  assertPresent(
    module?.contractVersion,
    "contractVersion",
    "registry-module",
    ErrorCode.MODULE_INVALID_IDENTITY
  );
}

/**
 * Valida los campos obligatorios de identidad de un adaptador (README §12,
 * regla D), incluyendo `subjectId`, antes de tocar ningún registro interno.
 */
export function assertValidAdapterIdentity(adapter: AdapterIdentityLike): void {
  assertNonEmptyTrimmed(adapter?.id, "id", "CORE_ADAPTER_INVALID_IDENTITY_ID", "registry-adapter");
  assertPresent(
    adapter?.version,
    "version",
    "registry-adapter",
    ErrorCode.ADAPTER_INVALID_IDENTITY
  );
  assertPresent(
    adapter?.contractVersion,
    "contractVersion",
    "registry-adapter",
    ErrorCode.ADAPTER_INVALID_IDENTITY
  );
  assertNonEmptyString(
    adapter?.subjectId,
    "subjectId",
    "registry-adapter",
    ErrorCode.ADAPTER_INVALID_IDENTITY
  );
}

function assertPresent(
  value: string | undefined | null,
  fieldName: string,
  origin: "registry-module" | "registry-adapter",
  code: ErrorCode
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new DWMError({
      code,
      message: `El campo "${fieldName}" es obligatorio y no puede estar vacío.`,
      origin,
      recoverable: true,
    });
  }
}

function assertNonEmptyString(
  value: string | undefined | null,
  fieldName: string,
  origin: "registry-module" | "registry-adapter",
  code: ErrorCode
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DWMError({
      code,
      message: `El campo "${fieldName}" es obligatorio y no puede estar vacío.`,
      origin,
      recoverable: true,
    });
  }
}

function assertNonEmptyTrimmed(
  value: string | undefined | null,
  fieldName: string,
  _codeHint: string,
  origin: "registry-module" | "registry-adapter"
): void {
  const code =
    origin === "registry-module"
      ? ErrorCode.MODULE_INVALID_IDENTITY
      : ErrorCode.ADAPTER_INVALID_IDENTITY;
  if (typeof value !== "string" || value.length === 0) {
    throw new DWMError({
      code,
      message: `El campo "${fieldName}" es obligatorio y no puede estar vacío.`,
      origin,
      recoverable: true,
    });
  }
  if (value.trim() !== value) {
    throw new DWMError({
      code,
      message: `El campo "${fieldName}" ("${value}") no puede tener espacios iniciales o finales.`,
      origin,
      recoverable: true,
    });
  }
}
