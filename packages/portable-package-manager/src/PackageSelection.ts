import { isExcluded, matchesGlob } from "@dwm/workspace";
import type { PackageResourceSource, PackageSelection } from "./PortablePackageTypes.js";

/** Recursos que solo se incluyen si se piden explícitamente (nunca por defecto). */
export const OPTIONAL_RESOURCE_IDS = ["backups", "logs", "tools", "runtime"] as const;

/** Id reservado del recurso de secretos: nunca se incluye salvo `includeSecrets: true` explícito. */
export const SECRETS_RESOURCE_ID = "secrets";

export interface ResolveSelectionInput {
  readonly availableSources: readonly PackageResourceSource[];
  readonly includeOptionalResources?: readonly string[] | undefined;
  readonly excludeResourceIds?: readonly string[] | undefined;
  readonly excludePatterns?: readonly string[] | undefined;
  readonly includePatterns?: readonly string[] | undefined;
  readonly includeSecrets?: boolean | undefined;
  readonly includeHidden?: boolean | undefined;
}

/**
 * Resuelve qué fuentes de recurso participan en un paquete a partir de
 * las disponibles y las preferencias del consumidor: los recursos
 * opcionales (`backups`, `logs`, `tools`, `runtime`) y `secrets` quedan
 * fuera salvo que se pidan explícitamente; el resto se incluye por
 * defecto salvo exclusión explícita por id.
 */
export function resolvePackageSelection(input: ResolveSelectionInput): PackageSelection {
  const excludeIds = new Set(input.excludeResourceIds ?? []);
  const includeOptional = new Set(input.includeOptionalResources ?? []);
  const includeSecrets = input.includeSecrets ?? false;

  const sources = input.availableSources.filter((source) => {
    if (excludeIds.has(source.id)) return false;
    if (
      (OPTIONAL_RESOURCE_IDS as readonly string[]).includes(source.id) &&
      !includeOptional.has(source.id)
    ) {
      return false;
    }
    if (source.id === SECRETS_RESOURCE_ID && !includeSecrets) return false;
    return true;
  });

  return {
    sources,
    excludePatterns: input.excludePatterns ?? [],
    includePatterns: input.includePatterns ?? [],
    includedOptionalResources: sources
      .map((s) => s.id)
      .filter((id) => (OPTIONAL_RESOURCE_IDS as readonly string[]).includes(id)),
    includeSecrets,
    includeHidden: input.includeHidden ?? true,
  };
}

/** Verdadero si `archiveRelativePath` (la ruta ya prefijada con el id de su fuente, p. ej. "config/app.json") debe incluirse según los patrones de `selection`. */
export function isEntrySelected(archiveRelativePath: string, selection: PackageSelection): boolean {
  if (isExcluded(archiveRelativePath, selection.excludePatterns)) return false;
  if (selection.includePatterns.length > 0) {
    return selection.includePatterns.some((pattern) => matchesGlob(pattern, archiveRelativePath));
  }
  return true;
}
