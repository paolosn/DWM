/** Extensión de fichero que toda regla del antiguo SISTEMA-DE-TRABAJO usa. */
export const RULE_FILE_EXTENSION = ".md";

/** Clave reservada de nivel superior dentro del frontmatter de una regla para los metadatos gestionados por DWM. */
export const RULE_DWM_FRONTMATTER_KEY = "dwm";

export interface RuleMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Una regla real del Workspace: físicamente, un fichero Markdown dentro
 * del recurso `rules` que reconoce `@dwm/psn-adapter` (p. ej.
 * `.kilo/rules/mi-regla.md`). `content` es el texto de ese fichero tal
 * como lo vería cualquier otra herramienta —incluido el frontmatter
 * propio del autor—, sin el bloque `dwm:` reservado, que vive por
 * separado en `metadata`.
 */
export interface Rule {
  readonly id: string;
  readonly content: string;
  readonly metadata: RuleMetadata;
}

/** Vista ligera de una regla, suficiente para listar, buscar y filtrar sin releer su fichero de cada una repetidamente. */
export interface RuleSummary {
  readonly id: string;
  readonly title?: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RuleCreateRequest {
  readonly id: string;
  readonly content: string;
}

export interface RuleFilter {
  readonly archived?: boolean;
}

export interface RuleListOptions {
  readonly includeArchived?: boolean;
  readonly root?: string;
}

/** Verdadero si `value` es un identificador de regla sintácticamente seguro: un único segmento de nombre de fichero, sin rutas ni caracteres especiales. */
export function isSafeRuleId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  if (value === "." || value === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/**
 * client-workflow "fix/library-edit-and-simple-ai" — comprobación real
 * usada ÚNICAMENTE para leer/editar/eliminar una regla que YA existe
 * en disco, nunca para crear una nueva (`createRule`/`duplicateRule`
 * siguen exigiendo `isSafeRuleId`, sin cambios). Sigue siendo segura
 * frente a path traversal, pero permite cualquier otro carácter real
 * de un nombre de fichero legítimo (espacios, tildes, mayúsculas).
 */
export function isSafeExistingRuleId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return false;
  if (value === "." || value === "..") return false;
  return !value.includes("/") && !value.includes("\\");
}

/** Verdadero si `content` es un contenido de regla válido: una cadena de texto Markdown. */
export function isRuleContent(value: unknown): value is string {
  return typeof value === "string";
}
