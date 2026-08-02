/**
 * Extensiones de fichero que `@dwm/knowledge-manager` reconoce como
 * conocimiento gestionable (contenido textual legible y editable). Un
 * fichero con cualquier otra extensión dentro del recurso `psn-knowledge-global`
 * sigue siendo visible en la navegación jerárquica (`KnowledgeManager.listTree()`),
 * pero no puede leerse ni editarse como conocimiento a través de este módulo.
 */
export const KNOWLEDGE_ALLOWED_EXTENSIONS = [".md", ".markdown", ".mdx", ".txt"] as const;

export type KnowledgeExtension = (typeof KNOWLEDGE_ALLOWED_EXTENSIONS)[number];

/** Clave reservada de nivel superior dentro del frontmatter de un elemento de conocimiento para los metadatos gestionados por DWM. */
export const KNOWLEDGE_DWM_FRONTMATTER_KEY = "dwm";

/** Nº máximo de segmentos de ruta (profundidad) admitidos para un id de conocimiento. */
export const KNOWLEDGE_MAX_PATH_DEPTH = 16;

export interface KnowledgeMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Etiquetas libres, normalizadas (minúsculas, sin duplicados), sin orden significativo. */
  readonly tags: readonly string[];
  /** Categoría única y opcional, distinta de la carpeta física en la que viva el fichero. */
  readonly category?: string;
  /** Ids de otros elementos de conocimiento con los que este mantiene una relación simple y dirigida. */
  readonly relations: readonly string[];
}

/**
 * Un elemento de conocimiento real del Workspace: físicamente, un
 * fichero dentro (a cualquier profundidad) del recurso
 * `psn-knowledge-global` que reconoce `@dwm/psn-adapter`. `id` es su
 * ruta relativa a la raíz de ese recurso, con separadores `/`
 * (independientemente del sistema operativo) — p. ej.
 * `"guias/onboarding.md"`. `content` es el texto del fichero tal como
 * lo vería cualquier otra herramienta —incluido el frontmatter propio
 * del autor—, sin el bloque `dwm:` reservado, que vive por separado en
 * `metadata`.
 */
export interface KnowledgeItem {
  readonly id: string;
  readonly content: string;
  readonly metadata: KnowledgeMetadata;
}

/** Vista ligera de un elemento de conocimiento, suficiente para listar, buscar, filtrar y navegar sin releer cada fichero repetidamente. */
export interface KnowledgeSummary {
  readonly id: string;
  readonly title?: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly category?: string;
  readonly relations: readonly string[];
}

export interface KnowledgeCreateRequest {
  readonly id: string;
  readonly content: string;
  readonly tags?: readonly string[];
  readonly category?: string;
}

/** Cambios parciales de metadatos (etiquetas/categoría), aplicables sin tocar el contenido del elemento. */
export interface KnowledgeMetadataUpdate {
  readonly tags?: readonly string[];
  readonly category?: string | null;
}

export interface KnowledgeFilter {
  readonly archived?: boolean;
  readonly category?: string;
  /** Un elemento coincide si tiene TODAS las etiquetas indicadas (coincidencia normalizada, sin distinguir mayúsculas). */
  readonly tags?: readonly string[];
}

export interface KnowledgeListOptions {
  readonly includeArchived?: boolean;
  readonly root?: string;
}

/**
 * La eliminación de un elemento de conocimiento es irreversible y debe
 * pedirse de forma explícita: `confirmPermanent` debe ser exactamente
 * `true`, nunca un valor por defecto, para que
 * `KnowledgeManager.deleteKnowledge()` proceda.
 */
export interface KnowledgeDeleteOptions {
  readonly confirmPermanent: boolean;
}

/** Un nodo del árbol de navegación jerárquica del recurso de conocimiento: una carpeta o un fichero. */
export interface KnowledgeNode {
  readonly name: string;
  /** Ruta relativa a la raíz del recurso de conocimiento, con separadores `/`. */
  readonly relativePath: string;
  readonly isDirectory: boolean;
  /** Presente únicamente cuando `isDirectory` es `false`; `undefined` para carpetas. */
  readonly recognized?: boolean;
  readonly children?: readonly KnowledgeNode[];
}

/** Un grupo de elementos de conocimiento que comparten el mismo criterio de duplicado (misma ruta normalizada o mismo nombre de fichero). */
export interface KnowledgeDuplicateGroup {
  readonly key: string;
  readonly ids: readonly string[];
}

/** Verdadero si `value` es un identificador de conocimiento sintácticamente seguro: una ruta relativa dentro del recurso de conocimiento, sin absolutas ni escapes `..`, con una extensión reconocida. */
export function isSafeKnowledgeId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  const segments = value.split(/[\\/]+/);
  if (segments.length === 0 || segments.length > KNOWLEDGE_MAX_PATH_DEPTH) return false;
  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === "..") return false;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._ -]*$/.test(segment)) return false;
  }
  return hasKnowledgeExtension(value);
}

/** Verdadero si `value` termina en una de las extensiones reconocidas por `@dwm/knowledge-manager`. */
export function hasKnowledgeExtension(value: string): boolean {
  return KNOWLEDGE_ALLOWED_EXTENSIONS.some((extension) => value.toLowerCase().endsWith(extension));
}

/** Verdadero si `content` es un contenido de conocimiento válido: una cadena de texto. */
export function isKnowledgeContent(value: unknown): value is string {
  return typeof value === "string";
}

/** Verdadero si `value` es una etiqueta sintácticamente segura: texto corto, no vacío, sin separadores de lista. */
export function isSafeKnowledgeTag(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return !/[,[\]\n\r]/.test(trimmed);
}

/** Verdadero si `value` es una categoría sintácticamente segura: texto corto, no vacío, sin separadores de lista. */
export function isSafeKnowledgeCategory(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return false;
  return !/[,[\]\n\r]/.test(trimmed);
}

/** Normaliza una lista de etiquetas: recorta espacios, pasa a minúsculas y elimina duplicados, preservando el primer orden de aparición. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** Convierte una ruta de sistema de ficheros en un id de conocimiento con separadores `/` normalizados. */
export function toKnowledgeId(relativePath: string): string {
  return relativePath.split(/[\\/]+/).join("/");
}

/** Nombre de fichero (último segmento) de un id de conocimiento. */
export function knowledgeBaseName(id: string): string {
  const segments = id.split("/");
  return segments[segments.length - 1] ?? id;
}
