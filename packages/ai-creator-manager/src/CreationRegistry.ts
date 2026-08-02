import type { CreationKind } from "./CreationTypes.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

/** Ciclo de vida de una operación de creación, tal y como lo recorre `CreationPipeline`. */
export const CREATION_OPERATION_STATES = [
  "pending",
  "validating",
  "resolving",
  "previewed",
  "executing",
  "completed",
  "cancelled",
  "failed",
] as const;
export type CreationOperationState = (typeof CREATION_OPERATION_STATES)[number];

const TERMINAL_STATES: readonly CreationOperationState[] = ["completed", "cancelled", "failed"];

export interface CreationOperationRecord {
  readonly operationId: string;
  readonly kind: CreationKind;
  readonly state: CreationOperationState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

/**
 * Mantiene en memoria —nunca persistido— el estado de cada operación de
 * creación en curso o ya finalizada, para que `AICreatorManager` pueda
 * consultarlas y, sobre todo, cancelarlas. `CreationPipeline` consulta
 * `isCancelled()` entre fases para dejar de avanzar en cuanto se pide la
 * cancelación, incluso si la fase en curso ya había empezado.
 */
export class CreationRegistry {
  private readonly operations = new Map<string, CreationOperationRecord>();

  register(operationId: string, kind: CreationKind): CreationOperationRecord {
    const now = new Date().toISOString();
    const record: CreationOperationRecord = {
      operationId,
      kind,
      state: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.operations.set(operationId, record);
    return record;
  }

  get(operationId: string): CreationOperationRecord | undefined {
    return this.operations.get(operationId);
  }

  require(operationId: string): CreationOperationRecord {
    const record = this.operations.get(operationId);
    if (!record) {
      throw createCreationError({
        code: CreationErrorCode.CREATION_OPERATION_NOT_FOUND,
        message: `No existe ninguna operación de creación registrada con id "${operationId}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  /** Actualiza el estado de una operación ya registrada. No permite salir de un estado terminal (completed/cancelled/failed). */
  transition(
    operationId: string,
    state: CreationOperationState,
    error?: string
  ): CreationOperationRecord {
    const current = this.require(operationId);
    if (TERMINAL_STATES.includes(current.state)) {
      return current;
    }
    const updated: CreationOperationRecord = {
      ...current,
      state,
      updatedAt: new Date().toISOString(),
      ...(error !== undefined ? { error } : {}),
    };
    this.operations.set(operationId, updated);
    return updated;
  }

  /** Marca la operación como cancelada, si existe y todavía no ha llegado a un estado terminal. Verdadero si la cancelación tuvo efecto. */
  cancel(operationId: string): boolean {
    const current = this.operations.get(operationId);
    if (!current || TERMINAL_STATES.includes(current.state)) return false;
    this.transition(operationId, "cancelled");
    return true;
  }

  isCancelled(operationId: string): boolean {
    return this.operations.get(operationId)?.state === "cancelled";
  }

  isTerminal(operationId: string): boolean {
    const record = this.operations.get(operationId);
    return record !== undefined && TERMINAL_STATES.includes(record.state);
  }

  list(): CreationOperationRecord[] {
    return [...this.operations.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  clear(): void {
    this.operations.clear();
  }
}
