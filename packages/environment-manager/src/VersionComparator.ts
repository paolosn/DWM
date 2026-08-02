import { VersionParser } from "./VersionParser.js";
import type { ToolVersion } from "./EnvironmentTypes.js";

/**
 * Compara y comprueba versiones `MAJOR.MINOR.PATCH[-prerelease]`. Una
 * versión sin `prerelease` se considera posterior a la misma versión
 * con `prerelease` (semántica habitual: `1.0.0` > `1.0.0-rc.1`).
 * Componentes ausentes (p. ej. `2` frente a `2.1`) se tratan como `0`.
 */
export class VersionComparator {
  private readonly parser = new VersionParser();

  /** -1 si `a` < `b`, 0 si son iguales, 1 si `a` > `b`. Acepta tanto texto crudo como `ToolVersion` ya parseado. */
  compare(a: string | ToolVersion, b: string | ToolVersion): -1 | 0 | 1 {
    const versionA = typeof a === "string" ? this.parser.parse(a) : a;
    const versionB = typeof b === "string" ? this.parser.parse(b) : b;
    if (!versionA || !versionB) {
      throw new RangeError("No se pudo interpretar una de las dos versiones a comparar.");
    }

    const majorCmp = this.compareNumbers(versionA.major, versionB.major);
    if (majorCmp !== 0) return majorCmp;
    const minorCmp = this.compareNumbers(versionA.minor, versionB.minor);
    if (minorCmp !== 0) return minorCmp;
    const patchCmp = this.compareNumbers(versionA.patch, versionB.patch);
    if (patchCmp !== 0) return patchCmp;

    if (versionA.prerelease === versionB.prerelease) return 0;
    if (versionA.prerelease === undefined) return 1;
    if (versionB.prerelease === undefined) return -1;
    return versionA.prerelease < versionB.prerelease ? -1 : 1;
  }

  /** Verdadero si `version` es igual o posterior a `minVersion`. */
  satisfiesMinimum(version: string | ToolVersion, minVersion: string | ToolVersion): boolean {
    return this.compare(version, minVersion) >= 0;
  }

  private compareNumbers(a: number | undefined, b: number | undefined): -1 | 0 | 1 {
    const numA = a ?? 0;
    const numB = b ?? 0;
    if (numA === numB) return 0;
    return numA > numB ? 1 : -1;
  }
}
