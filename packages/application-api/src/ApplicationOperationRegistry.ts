import { randomUUID } from "node:crypto";
import type { ApplicationCapability } from "./ApplicationTypes.js";
import type { ApplicationContext } from "./ApplicationContext.js";
import {
  ApplicationOperation,
  type ApplicationOperationSnapshot,
  isTerminalApplicationOperationState,
} from "./ApplicationOperation.js";
import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

export interface ApplicationOperationDefinition<TPayload = unknown, TResult = unknown> {
  readonly name: string;
  readonly version: string;
  readonly capabilities: readonly ApplicationCapability[];
  readonly destructive?: boolean;
  /** Si `true`, se ejecuta a través del registro de operaciones largas (con seguimiento de progreso). */
  readonly long?: boolean;
  /** Valida y normaliza el payload de frontera; debe lanzar `ApplicationError` si no es válido. */
  readonly validatePayload?: (payload: unknown) => TPayload;
  readonly handler: (
    payload: TPayload,
    ctx: ApplicationContext,
    op?: ApplicationOperation<TResult>
  ) => Promise<TResult> | TResult;
}

/**
 * Catálogo estable de definiciones de operación (nombre, versión,
 * capacidades exigidas y validador de payload), y registro en memoria de
 * las instancias en ejecución de operaciones largas (README §Progreso).
 * No implementa persistencia externa: se reinicia con el proceso.
 */
export class ApplicationOperationRegistry {
  private readonly definitions = new Map<string, ApplicationOperationDefinition>();
  private readonly running = new Map<string, ApplicationOperation>();

  register<TPayload, TResult>(definition: ApplicationOperationDefinition<TPayload, TResult>): void {
    this.definitions.set(definition.name, definition as ApplicationOperationDefinition);
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }

  get(name: string): ApplicationOperationDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): readonly ApplicationOperationDefinition[] {
    return Array.from(this.definitions.values());
  }

  // -----------------------------------------------------------------------
  // Seguimiento de operaciones largas
  // -----------------------------------------------------------------------

  beginTracking(
    operationName: string,
    requestId: string,
    options: { cancellable?: boolean; onCancel?: () => void } = {}
  ): ApplicationOperation {
    const record = new ApplicationOperation({
      operationId: randomUUID(),
      operation: operationName,
      requestId,
      ...(options.cancellable !== undefined ? { cancellable: options.cancellable } : {}),
      ...(options.onCancel ? { onCancel: options.onCancel } : {}),
    });
    this.running.set(record.operationId, record);
    return record;
  }

  getSnapshot(operationId: string): ApplicationOperationSnapshot | undefined {
    return this.running.get(operationId)?.toSnapshot();
  }

  requireSnapshot(operationId: string): ApplicationOperationSnapshot {
    const snapshot = this.getSnapshot(operationId);
    if (!snapshot) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_OPERATION_NOT_FOUND,
        message: `No existe ninguna operación en curso con id "${operationId}".`,
        origin: "operation",
        category: "not-found",
        retryable: false,
        recoverable: true,
      });
    }
    return snapshot;
  }

  listSnapshots(): readonly ApplicationOperationSnapshot[] {
    return Array.from(this.running.values()).map((op) => op.toSnapshot());
  }

  cancel(operationId: string): void {
    const record = this.running.get(operationId);
    if (!record) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_OPERATION_NOT_FOUND,
        message: `No existe ninguna operación en curso con id "${operationId}".`,
        origin: "operation",
        category: "not-found",
        retryable: false,
        recoverable: true,
      });
    }
    record.cancel();
  }

  /** Elimina del registro las operaciones terminadas (`completed`/`failed`/`cancelled`). */
  cleanupFinished(): number {
    let removed = 0;
    for (const [id, record] of this.running.entries()) {
      if (isTerminalApplicationOperationState(record.getState())) {
        this.running.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}
