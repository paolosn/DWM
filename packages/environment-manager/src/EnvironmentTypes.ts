/**
 * Plataformas de sistema operativo que este módulo distingue
 * explícitamente. Se deriva de `process.platform` a través de
 * `SystemInfoProvider`, nunca detectada por heurísticas de shell.
 */
export type EnvironmentPlatform = "windows" | "macos" | "linux" | "other";

export function normalizePlatform(nodePlatform: string): EnvironmentPlatform {
  if (nodePlatform === "win32") return "windows";
  if (nodePlatform === "darwin") return "macos";
  if (nodePlatform === "linux") return "linux";
  return "other";
}

/** Catálogo cerrado de categorías de herramienta. */
export const TOOL_CATEGORIES = [
  "vcs",
  "runtime",
  "package-manager",
  "language",
  "editor",
  "container",
  "ai",
  "media",
  "cli",
] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && (TOOL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Catálogo cerrado de estados de una herramienta tras la detección:
 * - `available`: encontrada y ejecutable con éxito.
 * - `missing`: no encontrada en ningún candidato del `PATH`.
 * - `invalid`: encontrada pero no ejecutable con éxito (permiso
 *   denegado, salida no interpretable, error de proceso, timeout...).
 *   Ver `reason` para el motivo concreto.
 * - `unsupported`: el detector declara que no aplica a la plataforma
 *   actual; no se intenta ejecutar nada.
 */
export const TOOL_STATUSES = ["available", "missing", "invalid", "unsupported"] as const;
export type ToolStatus = (typeof TOOL_STATUSES)[number];

/** Motivo concreto cuando el estado de una herramienta no es `available`. */
export type ToolIssueReason =
  | "not-found"
  | "spawn-error"
  | "timeout"
  | "output-too-large"
  | "non-zero-exit"
  | "unparsable-version"
  | "unsupported-platform"
  | "cancelled";

/** Versión de una herramienta, normalizada a partir de su salida bruta. Nunca incluye la salida completa del comando: solo el fragmento que parece una versión. */
export interface ToolVersion {
  readonly raw: string;
  readonly major?: number;
  readonly minor?: number;
  readonly patch?: number;
  readonly prerelease?: string;
}

/** Resultado de detectar una única herramienta. */
export interface ToolResult {
  readonly id: string;
  readonly name: string;
  readonly category: ToolCategory;
  readonly status: ToolStatus;
  readonly executablePath?: string;
  readonly command?: string;
  readonly version?: ToolVersion;
  readonly reason?: ToolIssueReason;
  /** Mensaje breve y seguro para mostrar al usuario. Nunca contiene el volcado completo de stdout/stderr ni variables de entorno. */
  readonly message?: string;
  readonly durationMs: number;
  readonly truncatedOutput?: boolean;
}

export interface EnvironmentWarning {
  readonly code: string;
  readonly message: string;
  readonly toolId?: string;
}

/** Información básica y no sensible del sistema operativo local. */
export interface EnvironmentPlatformInfo {
  readonly platform: EnvironmentPlatform;
  readonly nodePlatform: string;
  readonly architecture: string;
  readonly shell?: string;
}

/** Capacidades de alto nivel derivadas de los resultados de detección, útiles para decisiones rápidas sin recorrer `tools`. */
export interface EnvironmentCapabilities {
  readonly containerRuntime: boolean;
  readonly nodeJavaScript: boolean;
  readonly pythonRuntime: boolean;
  readonly phpRuntime: boolean;
}

/** Resumen completo de una inspección del entorno. */
export interface EnvironmentSummary {
  readonly platformInfo: EnvironmentPlatformInfo;
  readonly tools: readonly ToolResult[];
  readonly capabilities: EnvironmentCapabilities;
  readonly warnings: readonly EnvironmentWarning[];
  readonly availableCount: number;
  readonly missingCount: number;
  readonly invalidCount: number;
  readonly unsupportedCount: number;
  readonly generatedAt: string;
  readonly durationMs: number;
}

/** Un requisito que el consumidor del módulo quiere validar contra el entorno detectado. */
export interface EnvironmentRequirement {
  readonly toolId: string;
  readonly minVersion?: string;
  /** Si es `false`, la ausencia de la herramienta no se considera un incumplimiento (solo se informa). Por defecto `true`. */
  readonly required?: boolean;
}

export interface RequirementCheckResult {
  readonly toolId: string;
  readonly satisfied: boolean;
  readonly required: boolean;
  readonly status: ToolStatus;
  readonly foundVersion?: string;
  readonly minVersion?: string;
  readonly message?: string;
}

export interface EnvironmentValidationResult {
  readonly valid: boolean;
  readonly results: readonly RequirementCheckResult[];
}

export interface ToolFilter {
  readonly status?: ToolStatus;
  readonly category?: ToolCategory;
}

export interface InspectOptions {
  /** Si es `true`, ignora la caché en memoria y vuelve a detectar todas las herramientas. */
  readonly force?: boolean;
  readonly signal?: AbortSignal;
}
