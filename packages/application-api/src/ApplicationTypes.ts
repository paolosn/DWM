/**
 * Módulo 31 — Application API. Tipos base compartidos por todo el paquete:
 * versión pública, capacidades y catálogo de categorías de error.
 *
 * Este módulo NO redefine tipos de dominio ya existentes en los managers
 * (Agent, Skill, Backup, etc.): los reexporta o los referencia mediante
 * `import type` allí donde hace falta, y define únicamente lo que es
 * exclusivo de la capa de aplicación.
 */

/** Capacidades reconocidas por el sistema local de permisos (README del módulo). */
export type ApplicationCapability =
  | "read"
  | "write"
  | "delete"
  | "archive"
  | "restore"
  | "import"
  | "export"
  | "execute"
  | "configure"
  | "manage-secrets";

export const ALL_APPLICATION_CAPABILITIES: readonly ApplicationCapability[] = [
  "read",
  "write",
  "delete",
  "archive",
  "restore",
  "import",
  "export",
  "execute",
  "configure",
  "manage-secrets",
];

export function isApplicationCapability(value: unknown): value is ApplicationCapability {
  return (
    typeof value === "string" && (ALL_APPLICATION_CAPABILITIES as readonly string[]).includes(value)
  );
}

/** Versión pública declarada por la Application API (independiente de `package.json`). */
export const APPLICATION_API_VERSION = "1.0.0";

/** Versión mínima de contrato con la que esta API sigue siendo compatible. */
export const APPLICATION_API_MIN_COMPATIBLE_VERSION = "1.0.0";

/**
 * Compara dos versiones `MAJOR.MINOR.PATCH` y determina si `clientVersion`
 * sigue siendo compatible con `minCompatible`. Solo el `MAJOR` rompe
 * compatibilidad; `MINOR`/`PATCH` son aditivos (README §Versionado).
 */
export function isApiVersionCompatible(clientVersion: string, minCompatible: string): boolean {
  const clientMajor = parseMajor(clientVersion);
  const minMajor = parseMajor(minCompatible);
  if (clientMajor === undefined || minMajor === undefined) return false;
  return clientMajor === minMajor;
}

function parseMajor(version: string): number | undefined {
  const match = /^(\d+)\.\d+\.\d+$/.exec(version.trim());
  if (!match || !match[1]) return undefined;
  return Number.parseInt(match[1], 10);
}

/** Categorías estables de error expuestas en las respuestas normalizadas. */
export type ApplicationErrorCategory =
  "validation" | "permission" | "not-found" | "conflict" | "cancelled" | "unavailable" | "internal";

/** Estados posibles de una operación larga registrada en el sistema de progreso. */
export type ApplicationOperationState =
  "pending" | "running" | "completed" | "failed" | "cancelled";

export const ALL_APPLICATION_OPERATION_STATES: readonly ApplicationOperationState[] = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
];

/** Límites de frontera aplicados por `ApplicationValidator` (protección genérica de entrada). */
export const APPLICATION_LIMITS = {
  MAX_REQUEST_ID_LENGTH: 200,
  MAX_OPERATION_NAME_LENGTH: 200,
  MAX_STRING_FIELD_LENGTH: 100_000,
  MAX_PAYLOAD_KEYS: 200,
  MAX_JSON_DEPTH: 12,
} as const;
