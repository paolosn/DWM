import type { DesktopInvokeErrorPayload } from "../../shared/ipc/IpcContract.js";

/**
 * Módulo 33A — API Client. Error tipado que envuelve el payload de error
 * que ya construye `IpcRouter` (Módulo 32) a partir de `ApplicationError`
 * (Módulo 31). Nunca se construye a mano fuera de este cliente: siempre
 * viene de una `DesktopInvokeResponse` con `success: false`.
 */
export class DwmOperationError extends Error {
  readonly code: string;
  readonly category: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  readonly operation: string;

  constructor(operation: string, payload: DesktopInvokeErrorPayload) {
    super(payload.message);
    this.name = "DwmOperationError";
    this.operation = operation;
    this.code = payload.code;
    this.category = payload.category;
    this.retryable = payload.retryable;
    this.details = payload.details;
  }
}
