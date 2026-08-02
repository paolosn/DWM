/** Nombre del fichero que toda skill del antiguo SISTEMA-DE-TRABAJO usa como fuente principal. */
export const SKILL_FILE_NAME = "SKILL.md";

/** Clave reservada de nivel superior dentro del frontmatter de `SKILL.md` para los metadatos gestionados por DWM. */
export const SKILL_DWM_FRONTMATTER_KEY = "dwm";

export interface SkillMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Una skill real del Workspace: físicamente, una carpeta dentro del
 * recurso `skills` que reconoce `@dwm/psn-adapter` (p. ej.
 * `.kilo/skills/mi-skill/`), con su `SKILL.md` como fuente principal.
 * `content` es el texto de `SKILL.md` tal como lo vería cualquier otra
 * herramienta —incluido el frontmatter propio del autor—, sin el bloque
 * `dwm:` reservado, que vive por separado en `metadata`.
 */
export interface Skill {
  readonly id: string;
  readonly content: string;
  readonly metadata: SkillMetadata;
}

/** Un fichero o carpeta auxiliar dentro de la carpeta de una skill, distinto de `SKILL.md`. */
export interface SkillAuxFile {
  readonly relativePath: string;
  readonly isDirectory: boolean;
  readonly size?: number;
}

/** Vista ligera de una skill, suficiente para listar, buscar y filtrar sin releer `SKILL.md` de cada una repetidamente. */
export interface SkillSummary {
  readonly id: string;
  readonly title?: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** `false` si la carpeta de la skill existe pero `SKILL.md` está ausente o es estructuralmente inválido. */
  readonly hasSkillFile: boolean;
}

export interface SkillCreateRequest {
  readonly id: string;
  readonly content: string;
}

export interface SkillFilter {
  readonly archived?: boolean;
}

export interface SkillListOptions {
  readonly includeArchived?: boolean;
  readonly root?: string;
}

/**
 * La eliminación de una skill es irreversible y debe pedirse de forma
 * explícita: `confirmPermanent` debe ser exactamente `true`, nunca un
 * valor por defecto, para que `SkillManager.deleteSkill()` proceda.
 */
export interface SkillDeleteOptions {
  readonly confirmPermanent: boolean;
}

export type SkillFileStatus = "ok" | "missing" | "invalid";

/** Verdadero si `value` es un identificador de skill sintácticamente seguro: un único segmento de nombre de carpeta, sin rutas ni caracteres especiales. */
export function isSafeSkillId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  if (value === "." || value === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/** Verdadero si `segment` es una ruta relativa segura dentro de una carpeta de skill (sin absolutas, sin escapes `..`). */
export function isSafeSkillRelativePath(segment: unknown): segment is string {
  if (typeof segment !== "string" || segment.length === 0) return false;
  if (segment.startsWith("/") || segment.startsWith("\\")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(segment)) return false;
  const normalized = segment.split(/[\\/]+/);
  return normalized.every((part) => part.length > 0) && !normalized.some((part) => part === "..");
}
