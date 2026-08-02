import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { DEFAULT_INTEGRITY_ALGORITHM } from "./PortablePackageTypes.js";
import type { PackageManifestEntry } from "./PortablePackageTypes.js";

/** Calcula el hash de un `Buffer` con el algoritmo indicado, con el prefijo habitual `alg:hexdigest`. */
export function hashBuffer(
  buffer: Buffer,
  algorithm: string = DEFAULT_INTEGRITY_ALGORITHM
): string {
  return `${algorithm}:${createHash(algorithm).update(buffer).digest("hex")}`;
}

/** Calcula el hash de un fichero real en disco, leyéndolo en streaming (nunca lo carga entero de una vez salvo ficheros pequeños). */
export async function hashFile(
  filePath: string,
  algorithm: string = DEFAULT_INTEGRITY_ALGORITHM
): Promise<string> {
  const hash = createHash(algorithm);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead: number;
    do {
      const result = await handle.read(buffer, 0, buffer.length, null);
      bytesRead = result.bytesRead;
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    await handle.close();
  }
  return `${algorithm}:${hash.digest("hex")}`;
}

/**
 * Hash de contenido estable de todo el paquete: se calcula sobre las
 * entradas ya ordenadas de forma determinista (ver `PackageManifest`),
 * usando únicamente `relativePath`, `type`, `size` e `integrity` — nunca
 * `createdAt` ni ningún otro campo variable — para que dos paquetes con
 * el mismo contenido y las mismas opciones produzcan siempre el mismo
 * `contentHash`, aunque se generen en momentos distintos.
 */
export function computeContentHash(
  entries: readonly PackageManifestEntry[],
  algorithm: string = DEFAULT_INTEGRITY_ALGORITHM
): string {
  const hash = createHash(algorithm);
  for (const entry of entries) {
    hash.update(entry.relativePath);
    hash.update("\u0000");
    hash.update(entry.type);
    hash.update("\u0000");
    hash.update(String(entry.size));
    hash.update("\u0000");
    hash.update(entry.integrity ?? "");
    hash.update("\u0001");
  }
  return `${algorithm}:${hash.digest("hex")}`;
}
