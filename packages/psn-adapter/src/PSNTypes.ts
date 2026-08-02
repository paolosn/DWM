/**
 * Elementos del antiguo SISTEMA-DE-TRABAJO que `@dwm/psn-adapter` sabe
 * reconocer y clasificar. Catálogo cerrado: cualquier otra carpeta o
 * fichero de nivel superior queda como `unclassified` en el modelo, nunca
 * se inventa un tipo para él.
 */
export type PSNResourceKind =
  | "psn-base"
  | "kilo"
  | "agents"
  | "skills"
  | "rules"
  | "psn-knowledge-global"
  | "proyectos"
  | "clientes"
  | "auditorias"
  | "seguridad"
  | "redes-sociales"
  | "psn-panel";

export const ALL_PSN_RESOURCE_KINDS: readonly PSNResourceKind[] = [
  "psn-base",
  "kilo",
  "agents",
  "skills",
  "rules",
  "psn-knowledge-global",
  "proyectos",
  "clientes",
  "auditorias",
  "seguridad",
  "redes-sociales",
  "psn-panel",
];

export function isPSNResourceKind(value: unknown): value is PSNResourceKind {
  return ALL_PSN_RESOURCE_KINDS.includes(value as PSNResourceKind);
}

/**
 * Un elemento reconocido del Workspace importado. Nunca contiene el
 * contenido del recurso, solo su clasificación y ubicación relativa a la
 * raíz escaneada: el resto de módulos lo consultan a través de
 * `PSNAdapter`, nunca construyendo la ruta a mano.
 */
export interface PSNResource {
  readonly kind: PSNResourceKind;
  /** Nombre real tal como aparece en disco (preserva mayúsculas/minúsculas del origen). */
  readonly name: string;
  /** Ruta relativa a la raíz escaneada (p. ej. ".kilo/agents"). */
  readonly relativePath: string;
  readonly isDirectory: boolean;
  /** Presente cuando el recurso vive dentro de otro (p. ej. "agents" dentro de "kilo"). */
  readonly parentKind?: PSNResourceKind;
  /** Número de entradas directas dentro del recurso, sin analizar su contenido. */
  readonly entryCount?: number;
}

/** Resultado de escanear (clasificar) una raíz de Workspace importado. */
export interface PSNModel {
  readonly root: string;
  readonly resources: readonly PSNResource[];
  /** Nombres de nivel superior que no coincidieron con ningún `PSNResourceKind` conocido. */
  readonly unclassified: readonly string[];
  readonly scannedAt: number;
}
