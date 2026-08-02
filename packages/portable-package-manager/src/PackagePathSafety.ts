import * as path from "node:path";
import { PortablePackageErrorCode } from "./errors/PortablePackageErrorCode.js";
import { createPortablePackageError } from "./errors/PortablePackageError.js";

/** Nombres de fichero reservados en Windows (sin distinguir mayúsculas, ni con ni sin extensión). */
const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** Normaliza una ruta de entrada de paquete a separadores `/`, sin tocar su validez. */
export function normalizeEntryPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

/**
 * Verdadero si `relativePath` es una ruta de entrada de paquete segura:
 * relativa (nunca absoluta, nunca con letra de unidad), sin segmentos
 * `..` (path traversal / Zip Slip), sin bytes nulos, sin segmentos
 * vacíos ni nombres reservados de Windows, y de longitud razonable.
 */
export function isSafePackageEntryPath(relativePath: string): boolean {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.length > 4096) {
    return false;
  }
  if (relativePath.includes("\0")) return false;

  const normalized = normalizeEntryPath(relativePath);
  if (normalized.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(normalized)) return false;

  const rawSegments = normalized.split("/");
  // Segmentos vacíos intermedios ("a//b") no están permitidos.
  if (rawSegments.some((segment, index) => segment === "" && index !== rawSegments.length - 1)) {
    return false;
  }

  const segments = rawSegments.filter((segment) => segment.length > 0);
  if (segments.length === 0) return false;

  for (const segment of segments) {
    if (segment === "." || segment === "..") return false;
    const withoutExtension = segment.split(".")[0]?.toLowerCase() ?? "";
    if (RESERVED_WINDOWS_NAMES.has(withoutExtension)) return false;
  }

  return true;
}

export function assertSafePackageEntryPath(relativePath: string): void {
  if (!isSafePackageEntryPath(relativePath)) {
    throw createPortablePackageError({
      code: PortablePackageErrorCode.PACKAGE_UNSAFE_PATH,
      message: `La ruta de entrada "${relativePath}" no es segura (ruta absoluta, "..", nombre reservado o formato inválido).`,
      origin: "path",
      recoverable: true,
    });
  }
}

/**
 * Resuelve `relativePath` dentro de `destinationRoot` y verifica que el
 * resultado permanece dentro de esa raíz (protección Zip Slip). Devuelve
 * la ruta absoluta resultante si es segura; lanza si no lo es.
 */
export function resolveSafeExtractionPath(destinationRoot: string, relativePath: string): string {
  assertSafePackageEntryPath(relativePath);
  const resolvedRoot = path.resolve(destinationRoot);
  const target = path.resolve(resolvedRoot, ...normalizeEntryPath(relativePath).split("/"));
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw createPortablePackageError({
      code: PortablePackageErrorCode.PACKAGE_ZIP_SLIP,
      message: `La entrada "${relativePath}" resuelve fuera del destino de extracción "${destinationRoot}".`,
      origin: "path",
      recoverable: true,
    });
  }
  return target;
}

/**
 * Verdadero si `resolvedTarget` (una ruta ya resuelta, p. ej. el destino
 * real de un symlink) permanece dentro de `allowedRoot`. Usado para
 * decidir si un enlace simbólico encontrado al recorrer un origen es
 * seguro de seguir (dentro del origen permitido) o debe denegarse.
 */
export function isWithinAllowedRoot(allowedRoot: string, resolvedTarget: string): boolean {
  const root = path.resolve(allowedRoot);
  const target = path.resolve(resolvedTarget);
  return target === root || target.startsWith(root + path.sep);
}
