function globToRegExp(pattern: string): RegExp {
  const DOUBLE_STAR_PLACEHOLDER = "\u0000DOUBLESTAR\u0000";
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, DOUBLE_STAR_PLACEHOLDER)
    .replace(/\*/g, "[^/]*")
    .split(DOUBLE_STAR_PLACEHOLDER)
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

/** Indica si `relativePath` (siempre con separador "/") coincide con `pattern`. */
export function matchesGlob(pattern: string, relativePath: string): boolean {
  return globToRegExp(pattern).test(relativePath);
}

/** Indica si `relativePath` coincide con alguno de los patrones de exclusión. */
export function isExcluded(relativePath: string, excludePatterns: readonly string[]): boolean {
  return excludePatterns.some((pattern) => matchesGlob(pattern, relativePath));
}
