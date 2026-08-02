/** Nombre del subrecurso, dentro de cada Proyecto, donde vive el histórico de entregas. */
export const ENTREGAS_DIR_NAME = "ENTREGAS";

/** Nombre del fichero sidecar (oculto) donde `@dwm/delivery-manager` guarda los metadatos gestionados de una entrega. Nunca se sobrescribe el contenido entregado por el cliente: este fichero vive junto a él, dentro de la misma carpeta de entrega. */
export const DELIVERY_METADATA_FILE = ".dwm-delivery.json";

/**
 * Catálogo cerrado de tipos de entrega que un cliente puede hacer para un
 * proyecto. `folder` y `zip` describen la forma física del origen
 * importado (relevante para `@dwm/import-manager`); el resto describe su
 * naturaleza de negocio y es puramente informativo.
 */
export const DELIVERY_TYPES = [
  "folder",
  "zip",
  "backup",
  "source_code",
  "resources",
  "documentation",
  "database",
  "other",
] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export function isDeliveryType(value: unknown): value is DeliveryType {
  return typeof value === "string" && (DELIVERY_TYPES as readonly string[]).includes(value);
}

/** Forma física del origen que sabe importar `@dwm/import-manager` para una entrega. */
export const DELIVERY_SOURCE_TYPES = ["folder", "zip"] as const;
export type DeliverySourceType = (typeof DELIVERY_SOURCE_TYPES)[number];

export function isDeliverySourceType(value: unknown): value is DeliverySourceType {
  return typeof value === "string" && (DELIVERY_SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * Catálogo cerrado de estados de una entrega. `active` es, como mucho, una
 * por proyecto (la más reciente no archivada); al llegar una entrega nueva,
 * la anterior `active` pasa automáticamente a `superseded`. `archived` es
 * una decisión explícita del usuario y es terminal: una entrega archivada
 * nunca vuelve a `active` automáticamente.
 */
export const DELIVERY_STATES = ["active", "superseded", "archived"] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export function isDeliveryState(value: unknown): value is DeliveryState {
  return typeof value === "string" && (DELIVERY_STATES as readonly string[]).includes(value);
}

/** Metadatos reservados de DWM: el ciclo de vida técnico del registro, separado de los campos de negocio de la entrega. */
export interface DeliveryDwmMetadata {
  readonly archived: boolean;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Representación persistida (sidecar `.dwm-delivery.json`) de una entrega.
 * No incluye la ruta absoluta en disco: esa la resuelve siempre
 * `DeliveryRepository` a partir de la raíz del proyecto y `folderName`,
 * nunca se confía en un valor guardado que pudiera quedar obsoleto si el
 * proyecto se mueve.
 */
export interface DeliveryRecord {
  readonly id: string;
  readonly projectId: string;
  /** Nombre de la carpeta real bajo `ENTREGAS/` (p. ej. `2026-08-01 Inicial`). */
  readonly folderName: string;
  /** Nombre legible de la entrega (nombre), tal como lo indicó quien la registró. */
  readonly label: string;
  readonly type: DeliveryType;
  readonly state: DeliveryState;
  readonly version?: string;
  readonly notes?: string;
  /** Ruta absoluta de origen desde la que se importó (origen). */
  readonly origin: string;
  /** Hash sha256 determinista del contenido entregado (sin el sidecar de metadatos). */
  readonly hash: string;
  readonly sizeBytes: number;
  readonly fileCount: number;
  readonly directoryCount: number;
  /** Fecha de la entrega en sí (fecha), normalmente la fecha de importación salvo que se indique otra. */
  readonly deliveredAt: string;
  /** Fecha en la que DWM importó físicamente el contenido (fecha importación). */
  readonly importedAt: string;
  readonly dwm: DeliveryDwmMetadata;
}

/** `DeliveryRecord` más su ruta absoluta real en disco, resuelta por `DeliveryRepository`. */
export type Delivery = DeliveryRecord & { readonly path: string };

/** Vista ligera de una entrega, suficiente para listar el histórico sin recalcular hashes. */
export interface DeliverySummary {
  readonly id: string;
  readonly folderName: string;
  readonly label: string;
  readonly type: DeliveryType;
  readonly state: DeliveryState;
  readonly version?: string;
  readonly hash: string;
  readonly sizeBytes: number;
  readonly deliveredAt: string;
  readonly importedAt: string;
  readonly active: boolean;
}

/** Solicitud para importar una nueva entrega de cliente para un proyecto. Nunca sobrescribe: si `folderName` derivado ya existe, la importación falla. */
export interface DeliveryImportRequest {
  readonly projectId: string;
  /** Ruta absoluta a la raíz del proyecto (`ProjectConfiguration.projectPath`). */
  readonly projectPath: string;
  readonly sourceType: DeliverySourceType;
  /** Ruta absoluta a la carpeta o ZIP entregado por el cliente. */
  readonly sourcePath: string;
  readonly label: string;
  readonly type?: DeliveryType;
  readonly version?: string;
  readonly notes?: string;
  /** Si se omite, se usa la fecha de importación. */
  readonly deliveredAt?: string;
  /** Si es `true`, valida y escanea sin escribir nada en disco ni registrar la entrega. */
  readonly dryRun?: boolean;
}

export interface DeliveryFilter {
  readonly state?: DeliveryState;
  readonly type?: DeliveryType;
  readonly archived?: boolean;
}

export interface DeliveryArchiveOptions {
  readonly notes?: string;
}

/** Resultado de comparar dos entregas del histórico de un mismo proyecto. */
export interface DeliveryCompareResult {
  readonly a: DeliverySummary;
  readonly b: DeliverySummary;
  readonly hashMatch: boolean;
  readonly sizeDeltaBytes: number;
  readonly fileCountDelta: number;
  readonly directoryCountDelta: number;
}

/** Resultado de verificar la integridad de una entrega ya importada frente al hash almacenado. */
export interface DeliveryIntegrityResult {
  readonly valid: boolean;
  readonly storedHash: string;
  readonly currentHash: string;
  readonly issues: readonly string[];
}

/** Verdadero si `value` es un identificador de entrega sintácticamente seguro (uuid o similar, sin rutas). */
export function isSafeDeliveryId(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) return false;
  if (value === "." || value === "..") return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

/** Verdadero si `value` es una etiqueta (nombre) de entrega válida: texto no vacío, sin separadores de ruta, longitud razonable. */
export function isSafeDeliveryLabel(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  return !/[/\\]/.test(trimmed);
}

/** Verdadero si `value` es una versión válida (opcional): texto corto, sin separadores de ruta. */
export function isSafeDeliveryVersion(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  return !/[/\\]/.test(trimmed);
}

/** Verdadero si `value` son notas válidas (opcional): texto de longitud razonable. */
export function isSafeDeliveryNotes(value: unknown): value is string {
  return typeof value === "string" && value.length <= 5000;
}

/** Verdadero si `value` es una fecha ISO 8601 sintácticamente válida. */
export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Deriva un nombre de carpeta determinista y seguro para una entrega a
 * partir de su fecha y etiqueta, con el formato `AAAA-MM-DD Etiqueta` del
 * ejemplo de la especificación. Nunca contiene separadores de ruta.
 */
export function deriveDeliveryFolderName(deliveredAt: string, label: string): string {
  const datePart = deliveredAt.slice(0, 10);
  const safeLabel = label.trim().replace(/[/\\]/g, "-");
  return `${datePart} ${safeLabel}`;
}
