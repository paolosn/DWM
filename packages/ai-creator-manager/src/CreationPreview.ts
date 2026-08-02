import type {
  CreationKind,
  CreationConflict,
  CreationMetadata,
  CreationWarning,
} from "./CreationTypes.js";

/**
 * Previsualización completa de una creación, calculada sin escribir nada
 * en disco. `resolvedId` y `resolvedPayload` reflejan el resultado final
 * de aplicar plantilla y/o proveedor sobre la petición original. Toda
 * creación real (`AICreatorManager.create()`) pasa primero por aquí.
 */
export interface CreationPreview {
  readonly operationId: string;
  readonly kind: CreationKind;
  readonly resolvedId?: string;
  readonly resolvedPayload: unknown;
  readonly metadata: CreationMetadata;
  readonly dependencies: readonly string[];
  readonly missingDependencies: readonly string[];
  readonly conflicts: readonly CreationConflict[];
  readonly warnings: readonly CreationWarning[];
}

/** Verdadero si una previsualización no tiene conflictos ni dependencias ausentes, y por tanto puede ejecutarse. */
export function isPreviewExecutable(preview: CreationPreview): boolean {
  return preview.conflicts.length === 0 && preview.missingDependencies.length === 0;
}

export interface CreationPreviewInput {
  readonly operationId: string;
  readonly kind: CreationKind;
  readonly resolvedId?: string;
  readonly resolvedPayload: unknown;
  readonly metadata: CreationMetadata;
  readonly dependencies: readonly string[];
  readonly missingDependencies?: readonly string[];
  readonly conflicts?: readonly CreationConflict[];
  readonly warnings?: readonly CreationWarning[];
}

/**
 * Construye objetos `CreationPreview` completos a partir de entradas
 * parciales, aplicando los valores por defecto (listas vacías) de forma
 * consistente. No tiene estado propio ni conoce ningún manager: solo da
 * forma a los datos que le pasa `CreationPipeline`.
 */
export class CreationPreviewBuilder {
  build(input: CreationPreviewInput): CreationPreview {
    return {
      operationId: input.operationId,
      kind: input.kind,
      ...(input.resolvedId !== undefined ? { resolvedId: input.resolvedId } : {}),
      resolvedPayload: input.resolvedPayload,
      metadata: input.metadata,
      dependencies: input.dependencies,
      missingDependencies: input.missingDependencies ?? [],
      conflicts: input.conflicts ?? [],
      warnings: input.warnings ?? [],
    };
  }
}
