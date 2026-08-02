import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError, HostError } from "../errors/HostError.js";

export type CleanupEntryKind = "storage-provider" | "core" | "external-dependency" | "component";

export interface CleanupEntry {
  readonly kind: CleanupEntryKind;
  readonly id: string;
  dispose(): Promise<void>;
}

export interface CleanupFailure {
  readonly kind: CleanupEntryKind;
  readonly id: string;
  readonly error: HostError;
}

export interface CleanupResult {
  readonly failures: readonly CleanupFailure[];
}

/**
 * Pila de limpieza en memoria (TDS-001 §8.1): cada recurso con coste se
 * añade en el momento de su creación; el rollback la recorre en orden
 * inverso (última entrada creada, primera liberada), agregando cualquier
 * fallo sin detenerse por uno aislado (TDS-001 §8.2, punto 3-4).
 */
export class CleanupStack {
  private readonly entries: CleanupEntry[] = [];

  push(entry: CleanupEntry): void {
    this.entries.push(entry);
  }

  /**
   * Retira, sin invocar su `dispose()`, la última entrada que coincida con
   * `kind`+`id`. Se usa cuando un componente construido pasa a estar
   * registrado en el Core: a partir de ese momento, su liberación es
   * responsabilidad de `DWMCore.shutdown()`, no de esta pila.
   */
  discard(kind: CleanupEntryKind, id: string): void {
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      if (this.entries[i]!.kind === kind && this.entries[i]!.id === id) {
        this.entries.splice(i, 1);
        return;
      }
    }
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Libera todo lo acumulado, en orden inverso de creación, agregando los fallos. */
  async unwind(): Promise<CleanupResult> {
    const failures: CleanupFailure[] = [];
    while (this.entries.length > 0) {
      const entry = this.entries.pop()!;
      try {
        await entry.dispose();
      } catch (err) {
        failures.push({
          kind: entry.kind,
          id: entry.id,
          error: HostError.wrap(err, {
            code: HostErrorCode.HOST_EXTERNAL_DEPENDENCY_DISPOSE_FAILED,
            origin: "rollback",
            recoverable: true,
            message: `Fallo al liberar el recurso "${entry.id}" (${entry.kind}) durante el rollback.`,
          }),
        });
      }
    }
    return { failures };
  }
}

/** Construye el error agregado de rollback cuando la propia limpieza no puede completarse de forma coherente. */
export function createRollbackFailedError(failures: readonly CleanupFailure[]): HostError {
  return createHostError({
    code: HostErrorCode.HOST_COMPOSITION_ROLLBACK_FAILED,
    message: `El rollback produjo ${failures.length} fallo(s) al liberar recursos ya construidos.`,
    origin: "rollback",
    recoverable: false,
  });
}
