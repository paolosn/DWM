/**
 * Un agente real del Workspace es, físicamente, un fichero Markdown
 * individual dentro del recurso `agents` que reconoce `@dwm/psn-adapter`
 * (p. ej. `.kilo/agents/mi-agente.md`), con frontmatter YAML compatible
 * con el PSN-BASE real y con Kilo Code: `description`, `mode`, `color`
 * en el frontmatter, y el cuerpo empezando por un encabezado `# Nombre`.
 * `content` es el texto completo de ese fichero tal como lo vería
 * cualquier otra herramienta —incluido el frontmatter propio del
 * autor—, sin el bloque `dwm:` reservado, que vive por separado en
 * `metadata`.
 */
export const AGENT_FILE_EXTENSION = ".md";

/** Clave reservada de nivel superior dentro del frontmatter de un agente para los metadatos gestionados por DWM. */
export const AGENT_DWM_FRONTMATTER_KEY = "dwm";

export interface AgentMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Un agente completo: su identificador, su contenido Markdown real y sus metadatos gestionados. */
export interface Agent {
  readonly id: string;
  readonly content: string;
  readonly metadata: AgentMetadata;
}

/** Vista ligera de un agente, suficiente para listar, buscar y filtrar sin releer su fichero completo repetidamente. */
export interface AgentSummary {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly mode?: string;
  readonly color?: string;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentCreateRequest {
  readonly id: string;
  readonly content: string;
}

export interface AgentFilter {
  readonly archived?: boolean;
}

export interface AgentListOptions {
  readonly includeArchived?: boolean;
  readonly root?: string;
}

/** Verdadero si `value` es un identificador de agente sintácticamente seguro: un único segmento de nombre de fichero, sin rutas ni caracteres especiales. */
export function isSafeAgentId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  if (value === "." || value === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/**
 * client-workflow "fix/library-edit-and-simple-ai" — comprobación real
 * usada ÚNICAMENTE para leer/editar/eliminar un agente que YA existe
 * en disco (getAgent/updateAgent/deleteAgent), nunca para crear uno
 * nuevo (createAgent/duplicateAgent siguen exigiendo `isSafeAgentId`,
 * sin cambios). Sigue siendo segura frente a path traversal (nunca
 * `/`, `\`, `.` ni `..` solos, así que `path.join(directory, id +
 * extensión)` nunca puede escapar `directory`), pero permite
 * cualquier otro carácter real de un nombre de fichero legítimo
 * (espacios, tildes, mayúsculas) — el mismo tipo de nombre que ya
 * podía existir físicamente en PSN-BASE y que `AgentRepository.listIds()`
 * ya listaba sin exigir este patrón estricto.
 */
export function isSafeExistingAgentId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return false;
  if (value === "." || value === "..") return false;
  return !value.includes("/") && !value.includes("\\");
}

/** Verdadero si `content` es un contenido de agente válido: una cadena de texto Markdown. */
export function isAgentContent(value: unknown): value is string {
  return typeof value === "string";
}
