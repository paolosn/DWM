import type { ApplicationRequest } from "./ApplicationRequest.js";
import {
  type ApplicationResponse,
  makeErrorResponse,
  makeSuccessResponse,
} from "./ApplicationResponse.js";
import { ApplicationValidator } from "./ApplicationValidator.js";
import { ApplicationPermissions } from "./ApplicationPermissions.js";
import { ApplicationOperationRegistry } from "./ApplicationOperationRegistry.js";
import type { ApplicationOperationDefinition } from "./ApplicationOperationRegistry.js";
import type { ApplicationContext } from "./ApplicationContext.js";
import { ApplicationEvents } from "./ApplicationEvents.js";
import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";
import { mapErrorToPayload } from "./ApplicationErrorMapper.js";

export interface ApplicationRouterOptions {
  readonly operations: ApplicationOperationRegistry;
  readonly permissions: ApplicationPermissions;
  readonly context: ApplicationContext;
  readonly validator?: ApplicationValidator;
  readonly events?: ApplicationEvents;
}

/**
 * `ApplicationRouter` es el único punto de despacho de la Application API:
 * toda solicitud pasa por él antes de llegar a un `handler` de operación.
 * Orden fijo (README): validar forma -> comprobar permisos -> exigir
 * confirmación si es destructiva -> validar payload de dominio -> ejecutar
 * -> normalizar respuesta -> emitir eventos.
 */
export class ApplicationRouter {
  private readonly operations: ApplicationOperationRegistry;
  private readonly permissions: ApplicationPermissions;
  private readonly context: ApplicationContext;
  private readonly validator: ApplicationValidator;
  private readonly events: ApplicationEvents;

  constructor(options: ApplicationRouterOptions) {
    this.operations = options.operations;
    this.permissions = options.permissions;
    this.context = options.context;
    this.validator = options.validator ?? new ApplicationValidator();
    this.events = options.events ?? new ApplicationEvents(options.context.eventBus);
  }

  async dispatch(request: ApplicationRequest): Promise<ApplicationResponse> {
    // La forma mínima se valida siempre, incluso antes de saber si la
    // operación existe, para no filtrar detalles de qué operaciones existen
    // a partir de un requestId/operation malformados.
    let requestId = "unknown";
    let operation = "unknown";
    try {
      this.validator.assertValidShape(request);
      requestId = request.requestId;
      operation = request.operation;
      this.validator.assertNotDuplicateRequestId(requestId);
    } catch (err) {
      const payload = mapErrorToPayload(err);
      return makeErrorResponse(requestId, operation, payload);
    }

    await this.events.requestReceived({ requestId, operation });

    try {
      const definition = this.operations.get(operation);
      if (!definition) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_UNKNOWN_OPERATION,
          message: `La operación "${operation}" no existe.`,
          origin: "router",
          category: "not-found",
          retryable: false,
          recoverable: true,
        });
      }

      const allowed = this.permissions.check(operation, request.caller);
      if (!allowed) {
        await this.events.permissionDenied({
          requestId,
          operation,
          ...(request.caller?.id ? { callerId: request.caller.id } : {}),
        });
        throw createApplicationError({
          code: ApplicationErrorCode.APP_PERMISSION_DENIED,
          message: `El invocador no tiene los permisos necesarios para ejecutar "${operation}".`,
          origin: "permission",
          category: "permission",
          retryable: false,
          recoverable: true,
        });
      }

      if (this.permissions.isDestructive(operation)) {
        this.validator.assertDestructiveConfirmation(request);
      }

      const payload = definition.validatePayload
        ? definition.validatePayload(request.payload)
        : request.payload;

      this.validator.assertWithinSizeLimits(payload);

      await this.events.requestValidated({ requestId, operation });

      if (definition.long) {
        return await this.dispatchLong(request, definition, payload);
      }

      const data = await definition.handler(payload, this.context);
      return makeSuccessResponse(requestId, operation, data);
    } catch (err) {
      // `err` puede ser un `ApplicationError` (validación/permisos/router) o
      // un error de dominio de cualquier manager (`AgentError`,
      // `BackupError`, ...): `mapErrorToPayload` reconoce ambas formas sin
      // perder el código original.
      const payload = mapErrorToPayload(err);
      return makeErrorResponse(requestId, operation, payload);
    }
  }

  private async dispatchLong(
    request: ApplicationRequest,
    definition: ApplicationOperationDefinition,
    payload: unknown
  ): Promise<ApplicationResponse> {
    const record = this.operations.beginTracking(request.operation, request.requestId);
    record.start();
    await this.events.operationStarted({
      requestId: request.requestId,
      operation: request.operation,
      operationId: record.operationId,
      state: record.getState(),
    });

    try {
      const result = await definition.handler(payload, this.context, record);
      record.complete(result);
      await this.events.operationCompleted({
        requestId: request.requestId,
        operation: request.operation,
        operationId: record.operationId,
        state: record.getState(),
        progress: 100,
      });
      return makeSuccessResponse(request.requestId, request.operation, result, {
        metadata: { operationId: record.operationId },
      });
    } catch (err) {
      const mapped = mapErrorToPayload(err);
      record.fail({ code: mapped.code, message: mapped.message });
      await this.events.operationFailed({
        requestId: request.requestId,
        operation: request.operation,
        operationId: record.operationId,
        state: record.getState(),
      });
      return makeErrorResponse(request.requestId, request.operation, mapped, {
        operationId: record.operationId,
      });
    }
  }
}
