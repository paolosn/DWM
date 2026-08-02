import { isValidSemver } from "@dwm/core";
import type { PluginManifest } from "./PluginManifest.js";

export interface PluginCompatibilityResult {
  readonly compatible: boolean;
  readonly reason?: string;
}

function parseSemver(version: string): readonly [number, number, number] {
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));
  return [major ?? 0, minor ?? 0, patch ?? 0];
}

/** -1 si a<b, 0 si a==b, 1 si a>b. Precondición: ambas cadenas ya validadas con `isValidSemver`. */
function compareSemver(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemver(a);
  const [bMajor, bMinor, bPatch] = parseSemver(b);
  if (aMajor !== bMajor) return aMajor < bMajor ? -1 : 1;
  if (aMinor !== bMinor) return aMinor < bMinor ? -1 : 1;
  if (aPatch !== bPatch) return aPatch < bPatch ? -1 : 1;
  return 0;
}

/** Comprueba si `dwmVersion` satisface el rango `[minDwmVersion, maxDwmVersion]` declarado por el manifiesto. */
export function checkPluginCompatibility(
  manifest: PluginManifest,
  dwmVersion: string
): PluginCompatibilityResult {
  if (!isValidSemver(dwmVersion)) {
    return {
      compatible: false,
      reason: `La versión de DWM "${dwmVersion}" no tiene un formato semver válido.`,
    };
  }
  if (!isValidSemver(manifest.minDwmVersion)) {
    return {
      compatible: false,
      reason: `El manifiesto declara una minDwmVersion con formato inválido: "${manifest.minDwmVersion}".`,
    };
  }
  if (compareSemver(dwmVersion, manifest.minDwmVersion) < 0) {
    return {
      compatible: false,
      reason: `Requiere DWM >= ${manifest.minDwmVersion}, pero la versión actual es ${dwmVersion}.`,
    };
  }
  if (manifest.maxDwmVersion !== undefined) {
    if (!isValidSemver(manifest.maxDwmVersion)) {
      return {
        compatible: false,
        reason: `El manifiesto declara una maxDwmVersion con formato inválido: "${manifest.maxDwmVersion}".`,
      };
    }
    if (compareSemver(dwmVersion, manifest.maxDwmVersion) > 0) {
      return {
        compatible: false,
        reason: `Requiere DWM <= ${manifest.maxDwmVersion}, pero la versión actual es ${dwmVersion}.`,
      };
    }
  }
  return { compatible: true };
}

export { compareSemver };
