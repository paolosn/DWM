import type { ToolVersion } from "./EnvironmentTypes.js";

/**
 * Expresión que localiza el primer fragmento con forma de versión
 * semántica (`MAJOR[.MINOR[.PATCH]][-prerelease]`) dentro de una
 * cadena arbitraria — la salida típica de `--version` de casi
 * cualquier herramienta ("git version 2.43.0", "v20.11.0", "Python
 * 3.11.6", "Docker version 24.0.7, build afdd53b"...).
 */
const VERSION_PATTERN = /(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/;

/**
 * Extrae, de forma puramente sintáctica y sin ejecutar nada, un
 * `ToolVersion` a partir de la salida bruta de un comando. Nunca
 * devuelve la salida completa: `raw` es solo el fragmento que
 * coincide con el patrón de versión.
 */
export class VersionParser {
  parse(output: string): ToolVersion | undefined {
    const match = VERSION_PATTERN.exec(output);
    if (!match) return undefined;

    const [raw, major, minor, patch, prerelease] = match;
    return {
      raw,
      ...(major !== undefined ? { major: Number(major) } : {}),
      ...(minor !== undefined ? { minor: Number(minor) } : {}),
      ...(patch !== undefined ? { patch: Number(patch) } : {}),
      ...(prerelease !== undefined ? { prerelease } : {}),
    };
  }
}
