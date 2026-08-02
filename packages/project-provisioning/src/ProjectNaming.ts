/**
 * Normaliza un nombre humano a un nombre de carpeta seguro: sin
 * espacios (como exige PSN-PANEL: "Sin espacios. Usa guiones."), sin
 * separadores de ruta ni caracteres de control, y de longitud
 * razonable. Nunca produce una cadena vacía: si tras normalizar no
 * queda nada usable, cae a "proyecto".
 */
export function sanitizeProjectFolderName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return normalized.length > 0 ? normalized : "proyecto";
}

/** Igual normalización, reutilizada como id/slug de cliente (ambos exigen el mismo formato en `@dwm/client-manager`). */
export function sanitizeClientIdentifier(name: string): string {
  return sanitizeProjectFolderName(name);
}
