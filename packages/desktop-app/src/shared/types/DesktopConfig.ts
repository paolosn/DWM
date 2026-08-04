/**
 * Módulo 32 — Desktop Application. Forma de la configuración de escritorio
 * persistida entre sesiones (posición/tamaño de ventana, etc.). Es
 * deliberadamente pequeña: no contiene configuración funcional de negocio
 * (eso pertenece a `@dwm/config`, consumido únicamente por el motor DWM a
 * través de la Application API).
 */
export interface DesktopWindowBounds {
  readonly x?: number;
  readonly y?: number;
  readonly width: number;
  readonly height: number;
}

export type DesktopNavigationSection =
  | "dashboard"
  | "provisioning"
  | "workspace"
  | "projects"
  | "aiLibrary"
  | "agents"
  | "skills"
  | "rules"
  | "knowledge"
  | "clients"
  | "profiles"
  | "workspaces"
  | "aiCreator"
  | "ai"
  | "tools"
  | "plugins"
  | "packages"
  | "backups"
  | "status"
  | "logs"
  | "settings"
  | "help"
  | "about";

export interface DesktopConfiguration {
  readonly schemaVersion: 1;
  readonly window: DesktopWindowBounds;
  readonly windowMaximized: boolean;
  /**
   * Última sección de navegación activa. El Módulo 32 solo prepara el
   * sistema de navegación (no implementa las pantallas del Módulo 33), por
   * lo que este valor se persiste pero todavía no se conecta a ninguna
   * pantalla funcional.
   */
  readonly lastSection: DesktopNavigationSection;
}

export const DEFAULT_DESKTOP_WINDOW_BOUNDS: DesktopWindowBounds = {
  width: 1280,
  height: 800,
};

export const DEFAULT_DESKTOP_CONFIGURATION: DesktopConfiguration = {
  schemaVersion: 1,
  window: DEFAULT_DESKTOP_WINDOW_BOUNDS,
  windowMaximized: false,
  lastSection: "dashboard",
};

export function isDesktopWindowBounds(value: unknown): value is DesktopWindowBounds {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.width === "number" &&
    candidate.width > 0 &&
    typeof candidate.height === "number" &&
    candidate.height > 0 &&
    (candidate.x === undefined || typeof candidate.x === "number") &&
    (candidate.y === undefined || typeof candidate.y === "number")
  );
}

const KNOWN_NAVIGATION_SECTIONS: readonly DesktopNavigationSection[] = [
  "dashboard",
  "provisioning",
  "workspace",
  "projects",
  "aiLibrary",
  "agents",
  "skills",
  "rules",
  "knowledge",
  "clients",
  "profiles",
  "workspaces",
  "aiCreator",
  "ai",
  "tools",
  "plugins",
  "packages",
  "backups",
  "status",
  "logs",
  "settings",
  "help",
  "about",
];

export function isDesktopNavigationSection(value: unknown): value is DesktopNavigationSection {
  return (
    typeof value === "string" && (KNOWN_NAVIGATION_SECTIONS as readonly string[]).includes(value)
  );
}

/**
 * Valida y normaliza un valor arbitrario (típicamente leído de disco) como
 * `DesktopConfiguration`, aplicando valores por defecto ante cualquier
 * campo ausente o inválido en vez de fallar: la configuración de ventana
 * nunca debe impedir que la aplicación arranque.
 */
export function normalizeDesktopConfiguration(value: unknown): DesktopConfiguration {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_DESKTOP_CONFIGURATION;
  }
  const candidate = value as Partial<DesktopConfiguration>;
  const window = isDesktopWindowBounds(candidate.window)
    ? candidate.window
    : DEFAULT_DESKTOP_WINDOW_BOUNDS;
  const windowMaximized = candidate.windowMaximized === true;
  const lastSection = isDesktopNavigationSection(candidate.lastSection)
    ? candidate.lastSection
    : "dashboard";
  return { schemaVersion: 1, window, windowMaximized, lastSection };
}
