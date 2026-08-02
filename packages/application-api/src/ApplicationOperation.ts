import type { ApplicationOperationState } from "./ApplicationTypes.js";
import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

const ALLOWED_TRANSITIONS: Readonly<
  Record<ApplicationOperationState, readonly ApplicationOperationState[]>
> = {
  pending: ["running", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function isApplicationOperationTransitionAllowed(
  from: ApplicationOperationState,
  to: ApplicationOperationState
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalApplicationOperationState(state: ApplicationOperationState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}

export interface ApplicationOperationSnapshot<TResult = unknown> {
  readonly operationId: string;
  readonly operation: string;
  readonly requestId: string;
  readonly state: ApplicationOperationState;
  readonly progress: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly result?: TResult;
  readonly error?: { readonly code: string; readonly message: string };
  readonly cancellable: boolean;
}

/**
 * Instancia en memoria de una operación larga (README §Progreso y
 * operaciones largas). No persiste en disco todavía: vive únicamente en
 * `ApplicationOperationRegistry` durante la vida del proceso.
 */
export class ApplicationOperation<TResult = unknown> {
  readonly operationId: string;
  readonly operation: string;
  readonly requestId: string;
  readonly startedAt: string;
  readonly cancellable: boolean;

  private state: ApplicationOperationState = "pending";
  private progress = 0;
  private updatedAt: string;
  private result?: TResult;
  private error?: { code: string; message: string };
  private readonly abortController: AbortController;
  private readonly onCancel: (() => void) | undefined;

  constructor(options: {
    operationId: string;
    operation: string;
    requestId: string;
    cancellable?: boolean;
    onCancel?: () => void;
  }) {
    this.operationId = options.operationId;
    this.operation = options.operation;
    this.requestId = options.requestId;
    this.cancellable = options.cancellable ?? true;
    this.startedAt = new Date().toISOString();
    this.updatedAt = this.startedAt;
    this.abortController = new AbortController();
    this.onCancel = options.onCancel;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  getState(): ApplicationOperationState {
    return this.state;
  }

  private transition(to: ApplicationOperationState): void {
    if (!isApplicationOperationTransitionAllowed(this.state, to)) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_REQUEST,
        message: `Transición de estado no permitida: "${this.state}" -> "${to}".`,
        origin: "operation",
        category: "conflict",
        retryable: false,
        recoverable: true,
      });
    }
    this.state = to;
    this.updatedAt = new Date().toISOString();
  }

  start(): void {
    this.transition("running");
  }

  reportProgress(progress: number): void {
    this.progress = Math.min(100, Math.max(0, progress));
    this.updatedAt = new Date().toISOString();
  }

  complete(result: TResult): void {
    this.transition("completed");
    this.result = result;
    this.progress = 100;
  }

  fail(error: { code: string; message: string }): void {
    this.transition("failed");
    this.error = error;
  }

  cancel(): void {
    if (!this.cancellable) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_CANCELLATION_NOT_SUPPORTED,
        message: `La operación "${this.operationId}" no admite cancelación.`,
        origin: "operation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
    if (isTerminalApplicationOperationState(this.state)) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_REQUEST,
        message: `La operación "${this.operationId}" ya ha finalizado y no puede cancelarse.`,
        origin: "operation",
        category: "conflict",
        retryable: false,
        recoverable: true,
      });
    }
    this.transition("cancelled");
    this.abortController.abort();
    this.onCancel?.();
  }

  toSnapshot(): ApplicationOperationSnapshot<TResult> {
    return {
      operationId: this.operationId,
      operation: this.operation,
      requestId: this.requestId,
      state: this.state,
      progress: this.progress,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      cancellable: this.cancellable,
      ...(this.result !== undefined ? { result: this.result } : {}),
      ...(this.error ? { error: this.error } : {}),
    };
  }
}
