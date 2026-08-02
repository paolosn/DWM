import type { CreationKind } from "./CreationTypes.js";
import type { CreationPreview } from "./CreationPreview.js";

/**
 * Resultado de procesar una petición de creación. Cuando `dryRun` es
 * `true` (o cuando la previsualización tuvo conflictos/dependencias
 * ausentes y no se forzó su resolución), `created` es `false` y `data`
 * se omite: nada se escribió en disco.
 */
export interface CreationResult {
  readonly operationId: string;
  readonly kind: CreationKind;
  readonly id?: string;
  readonly dryRun: boolean;
  readonly created: boolean;
  readonly data?: unknown;
  readonly preview: CreationPreview;
}

/** Resultado de una creación de estructura completa (varios recursos relacionados). */
export interface StructureCreationResult {
  readonly operationId: string;
  readonly dryRun: boolean;
  readonly results: readonly CreationResult[];
  /** Índice (0-based) del elemento en el que falló la estructura, si no se completó entera. */
  readonly failedAt?: number;
  readonly error?: string;
}
