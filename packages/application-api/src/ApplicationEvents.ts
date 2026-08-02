import type { EventBus } from "@dwm/event-bus";
import type { ApplicationOperationState } from "./ApplicationTypes.js";

/** Nombres de evento normalizados emitidos por la Application API (namespace `application.*`). */
export const ApplicationEventName = {
  REQUEST_RECEIVED: "application.request.received",
  REQUEST_VALIDATED: "application.request.validated",
  OPERATION_STARTED: "application.operation.started",
  OPERATION_PROGRESS: "application.operation.progress",
  OPERATION_COMPLETED: "application.operation.completed",
  OPERATION_FAILED: "application.operation.failed",
  OPERATION_CANCELLED: "application.operation.cancelled",
  PERMISSION_DENIED: "application.permission.denied",
} as const;

export type ApplicationEventNameValue =
  (typeof ApplicationEventName)[keyof typeof ApplicationEventName];

export interface ApplicationRequestEventPayload {
  readonly requestId: string;
  readonly operation: string;
}

export interface ApplicationOperationEventPayload {
  readonly requestId: string;
  readonly operation: string;
  readonly operationId?: string;
  readonly state?: ApplicationOperationState;
  readonly progress?: number;
}

export interface ApplicationPermissionDeniedEventPayload {
  readonly requestId: string;
  readonly operation: string;
  readonly callerId?: string;
}

/**
 * Envoltorio fino sobre `@dwm/event-bus` para emitir eventos normalizados de
 * la Application API. Nunca incluye datos sensibles (payloads completos,
 * secretos, rutas no autorizadas) en el cuerpo del evento: solo
 * identificadores y metadatos de progreso.
 */
export class ApplicationEvents {
  constructor(private readonly eventBus?: EventBus) {}

  async requestReceived(payload: ApplicationRequestEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.REQUEST_RECEIVED, payload);
  }

  async requestValidated(payload: ApplicationRequestEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.REQUEST_VALIDATED, payload);
  }

  async operationStarted(payload: ApplicationOperationEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.OPERATION_STARTED, payload);
  }

  async operationProgress(payload: ApplicationOperationEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.OPERATION_PROGRESS, payload);
  }

  async operationCompleted(payload: ApplicationOperationEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.OPERATION_COMPLETED, payload);
  }

  async operationFailed(payload: ApplicationOperationEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.OPERATION_FAILED, payload);
  }

  async operationCancelled(payload: ApplicationOperationEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.OPERATION_CANCELLED, payload);
  }

  async permissionDenied(payload: ApplicationPermissionDeniedEventPayload): Promise<void> {
    await this.publish(ApplicationEventName.PERMISSION_DENIED, payload);
  }

  private async publish(event: ApplicationEventNameValue, payload: unknown): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(event, payload);
  }
}
