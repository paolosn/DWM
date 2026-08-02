/**
 * Estructura de carpetas que debe existir bajo la raíz de DWM, tal como
 * la define el encargo. Rutas relativas a la raíz, usando siempre `/`
 * como separador lógico (se normalizan con `path.join` al aplicarlas).
 */
export const REQUIRED_DIRECTORIES: readonly string[] = [
  "app",
  "engine",
  "workspace",
  "workspace/SISTEMA-DE-TRABAJO",
  ".dwm",
  ".dwm/cache",
  ".dwm/history",
  ".dwm/index",
  ".dwm/metadata",
  "config",
  "secrets",
  "profiles",
  "plugins",
  "backups",
  "logs",
  "tools",
  "runtime",
];

export const WORKSPACE_METADATA_RELATIVE_PATH = ".dwm/workspace.json";

export interface WorkspaceValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface WorkspaceValidationResult {
  readonly valid: boolean;
  readonly issues: readonly WorkspaceValidationIssue[];
}

export interface PermissionCheckResult {
  readonly canRead: boolean;
  readonly canWrite: boolean;
}

export interface SpaceCheckResult {
  /** `undefined` si la plataforma no permite consultar el espacio disponible. */
  readonly availableBytes?: number;
  readonly checked: boolean;
}
