/**
 * Configuración normalizada del sistema (ADR-001 §9): independiente del
 * formato nativo de cualquier herramienta externa. El Core solo conoce este
 * formato; la traducción hacia/desde formatos nativos es responsabilidad de
 * los adaptadores, no del Core.
 */
export interface NormalizedConfig {
  /** Versión del esquema de configuración (para compatibilidad, ADR-001 §19). */
  schemaVersion: string;

  /** Identificador del perfil activo, o null si no se ha seleccionado ninguno. */
  activeProfileId: string | null;

  /** Preferencias generales que el usuario puede modificar (FRS-001 §13.1). */
  preferences: {
    backupFrequency: "manual" | "on-session-close" | "daily" | "weekly";
    notifyUpdates: boolean;
    logLevel: "error" | "warning" | "info" | "debug";
  };
}

/** Configuración por defecto aplicada en primera ejecución (FRS-001 §1.4). */
export const DEFAULT_CONFIG: NormalizedConfig = {
  schemaVersion: "1.0.0",
  activeProfileId: null,
  preferences: {
    backupFrequency: "manual",
    notifyUpdates: true,
    logLevel: "info",
  },
};
