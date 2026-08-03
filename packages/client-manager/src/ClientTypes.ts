/** Clave reservada de nivel superior en el JSON de un cliente para los metadatos gestionados por DWM. */
export const CLIENT_DWM_KEY = "dwm";

/** Extensión de fichero que todo cliente del Workspace usa. */
export const CLIENT_FILE_EXTENSION = ".json";

/**
 * Catálogo cerrado de estados de negocio de un cliente. Deliberadamente
 * pequeño: este módulo NO implementa CRM comercial, así que no incluye
 * etapas de pipeline (leads, oportunidades ganadas/perdidas). `archived`
 * es un ciclo de vida aparte (ver `ClientDwmMetadata.archived`), no un
 * valor de `status`.
 */
export const CLIENT_STATUSES = ["prospect", "active", "paused", "inactive"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && (CLIENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Catálogo cerrado de categorías de referencia que un cliente puede
 * mantener hacia otros recursos del Workspace. Cada categoría apunta a
 * ids de un módulo distinto; no hay referencias cliente-a-cliente en
 * este modelo (module 27 no lo pide), por lo que la noción de "ciclo"
 * no aplica dentro de una misma categoría — sí se guarda cada id como
 * máximo una vez por categoría (sin duplicados).
 */
export const CLIENT_REFERENCE_KINDS = [
  "projects",
  "knowledge",
  "agents",
  "skills",
  "rules",
] as const;
export type ClientReferenceKind = (typeof CLIENT_REFERENCE_KINDS)[number];

export function isClientReferenceKind(value: unknown): value is ClientReferenceKind {
  return typeof value === "string" && (CLIENT_REFERENCE_KINDS as readonly string[]).includes(value);
}

/** Referencias simples y estables de un cliente hacia otros recursos del Workspace, por categoría. Nunca duplica el contenido referenciado: solo guarda ids. */
export interface ClientReferences {
  readonly projects: readonly string[];
  readonly knowledge: readonly string[];
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly rules: readonly string[];
}

export function emptyClientReferences(): ClientReferences {
  return { projects: [], knowledge: [], agents: [], skills: [], rules: [] };
}

/**
 * IA predeterminada de un cliente (encargo "client-workflow-v2"):
 * proveedor y modelo por defecto, modelo de reserva, y una referencia
 * de secreto (nunca el valor) para la clave asociada. Todo opcional:
 * un cliente sin IA configurada simplemente no tiene este bloque. Un
 * proyecto puede definir su propia configuración de IA independiente
 * (fuera de este módulo, en la configuración del propio proyecto); esto
 * es solo el valor por defecto a nivel de cliente.
 */
export interface ClientDefaultAi {
  readonly provider?: string;
  readonly model?: string;
  readonly fallbackModel?: string;
  /** Referencia a `@dwm/secrets`; nunca el valor de la clave. */
  readonly secretReference?: string;
}

export function isSafeClientDefaultAi(value: unknown): value is ClientDefaultAi {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  for (const key of ["provider", "model", "fallbackModel", "secretReference"] as const) {
    const field = record[key];
    if (field !== undefined && (typeof field !== "string" || field.length > 256)) return false;
  }
  return true;
}

/** Metadatos reservados de DWM: el ciclo de vida técnico del registro, separado de los campos de negocio del cliente. */
export interface ClientDwmMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Un cliente real del Workspace: físicamente, un fichero JSON dentro
 * del recurso `clientes` que reconoce `@dwm/psn-adapter` (p. ej.
 * `CLIENTES/mci-finance.json`). `id` es el identificador estable usado
 * como nombre de fichero; `slug` es un identificador legible e
 * independiente (para URLs u otras vistas), también único en todo el
 * Workspace.
 */
export interface Client {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: ClientStatus;
  readonly tags: readonly string[];
  readonly description?: string;
  readonly references: ClientReferences;
  /** IA predeterminada del cliente (opcional); ver `ClientDefaultAi`. */
  readonly defaultAi?: ClientDefaultAi;
  readonly dwm: ClientDwmMetadata;
}

/** Vista ligera de un cliente, suficiente para listar, buscar y filtrar sin releer cada fichero repetidamente. */
export interface ClientSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: ClientStatus;
  readonly tags: readonly string[];
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClientCreateRequest {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status?: ClientStatus;
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly references?: Partial<ClientReferences>;
  readonly defaultAi?: ClientDefaultAi;
}

/** Cambios parciales a los campos de negocio de un cliente, aplicables sin tocar sus referencias. */
export interface ClientUpdateRequest {
  readonly name?: string;
  readonly slug?: string;
  readonly status?: ClientStatus;
  readonly tags?: readonly string[];
  readonly description?: string | null;
  readonly defaultAi?: ClientDefaultAi | null;
}

export interface ClientFilter {
  readonly archived?: boolean;
  readonly status?: ClientStatus;
  /** Un cliente coincide si tiene TODAS las etiquetas indicadas (coincidencia normalizada, sin distinguir mayúsculas). */
  readonly tags?: readonly string[];
}

export interface ClientListOptions {
  readonly includeArchived?: boolean;
  readonly root?: string;
}

/**
 * La eliminación de un cliente es irreversible y debe pedirse de forma
 * explícita: `confirmPermanent` debe ser exactamente `true`, nunca un
 * valor por defecto, para que `ClientManager.deleteClient()` proceda.
 */
export interface ClientDeleteOptions {
  readonly confirmPermanent: boolean;
}

/** Resultado de comprobar las referencias de un cliente contra los módulos reales disponibles. Las categorías cuyo módulo no esté integrado no se comprueban (no se listan ni como válidas ni como inválidas). */
export interface ClientReferenceCheck {
  readonly checked: readonly ClientReferenceKind[];
  readonly missing: Readonly<Partial<Record<ClientReferenceKind, readonly string[]>>>;
}

/** Verdadero si `value` es un identificador de cliente sintácticamente seguro: un único segmento de nombre de fichero, sin rutas ni caracteres especiales. */
export function isSafeClientId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  if (value === "." || value === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/** Verdadero si `value` es un slug válido: minúsculas, dígitos y guiones simples, sin empezar ni terminar en guion. */
export function isSafeClientSlug(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

/** Verdadero si `value` es un nombre de cliente válido: texto no vacío y de longitud razonable. */
export function isSafeClientName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 256;
}

/** Verdadero si `value` es una descripción válida (opcional): texto de longitud razonable. */
export function isSafeClientDescription(value: unknown): value is string {
  return typeof value === "string" && value.length <= 5000;
}

/** Verdadero si `value` es una etiqueta sintácticamente segura: texto corto, no vacío, sin separadores de lista. */
export function isSafeClientTag(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
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

/** Añade `refId` a la lista de referencias `current` de forma idempotente (sin duplicados), preservando el orden. */
export function withReferenceAdded(current: readonly string[], refId: string): readonly string[] {
  return current.includes(refId) ? current : [...current, refId];
}

/** Retira `refId` de la lista de referencias `current` de forma idempotente. */
export function withReferenceRemoved(current: readonly string[], refId: string): readonly string[] {
  return current.includes(refId) ? current.filter((id) => id !== refId) : current;
}
