/**
 * Un agente real del Workspace es, físicamente, un fichero JSON dentro del
 * recurso `agents` que reconoce `@dwm/psn-adapter` (p. ej.
 * `.kilo/agents/mi-agente.json`). `AgentManager` no impone ni reinterpreta
 * el formato interno de ese JSON —heredado del antiguo SISTEMA-DE-TRABAJO
 * y de las herramientas que lo generan (Kilo Code y similares)—: lo trata
 * como datos de agente de forma abierta.
 */
export type AgentData = Record<string, unknown>;

/**
 * Clave reservada dentro del propio fichero del agente para los metadatos
 * que gestiona `@dwm/agent-manager` (archivado, fechas). Vive dentro del
 * mismo fichero para no crear una base de datos ni duplicar información
 * en otro sitio, y para no tener que mover ni renombrar nada al archivar.
 */
export const AGENT_MANAGED_METADATA_KEY = "__dwm" as const;

export interface AgentMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Un agente completo: su identificador, sus datos libres y sus metadatos gestionados. */
export interface Agent {
  readonly id: string;
  readonly data: AgentData;
  readonly metadata: AgentMetadata;
}

/** Vista ligera de un agente, suficiente para listar, buscar y filtrar sin leer el fichero completo repetidamente. */
export interface AgentSummary {
  readonly id: string;
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentCreateRequest {
  readonly id: string;
  readonly data: AgentData;
}

export interface AgentFilter {
  readonly archived?: boolean;
  readonly tags?: readonly string[];
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

/** Verdadero si `value` es un objeto de datos de agente válido: un objeto JSON plano (nunca `null`, un array o un primitivo). */
export function isAgentData(value: unknown): value is AgentData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extrae, de forma heurística y sin validarlos, un nombre y unas etiquetas legibles de unos datos de agente, para construir su `AgentSummary`. */
export function extractAgentDisplayFields(data: AgentData): {
  readonly name?: string;
  readonly tags?: readonly string[];
} {
  const name = typeof data["name"] === "string" ? (data["name"] as string) : undefined;
  const tags = Array.isArray(data["tags"])
    ? (data["tags"] as unknown[]).filter((tag): tag is string => typeof tag === "string")
    : undefined;
  return {
    ...(name ? { name } : {}),
    ...(tags ? { tags } : {}),
  };
}
