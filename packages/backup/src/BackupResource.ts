export type BackupResourceType =
  "project" | "workspace" | "profile" | "config" | "plugin-metadata" | "secret-ref" | "custom";

/**
 * Referencia simbólica a un recurso a respaldar. Nunca contiene el
 * contenido del recurso: solo su tipo e identificador, que un
 * `BackupSourceResolver` resuelve de forma segura en el momento del
 * backup. Para `secret-ref`, `resourceId` es la clave del secreto en
 * `@dwm/secrets`, nunca su valor.
 */
export interface BackupResource {
  readonly resourceType: BackupResourceType;
  readonly resourceId: string;
  readonly required?: boolean;
}

/** Verdadero si `segment` es una ruta relativa segura (sin absolutas ni escapes `..`). */
export function isSafeRelativePath(segment: string): boolean {
  if (typeof segment !== "string" || segment.length === 0) return false;
  if (segment.startsWith("/") || segment.startsWith("\\")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(segment)) return false;
  const normalized = segment.split(/[\\/]+/);
  return !normalized.some((part) => part === "..");
}
