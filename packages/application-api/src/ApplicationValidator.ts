import { APPLICATION_LIMITS } from "./ApplicationTypes.js";
import type { ApplicationRequest } from "./ApplicationRequest.js";
import { ApplicationError, createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const OPERATION_NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validación de frontera de la Application API (README §Validación). Cubre
 * exclusivamente lo genérico a cualquier operación: forma de la solicitud,
 * tamaño de campos, profundidad del payload y seguridad de rutas. La
 * validación de dominio (p. ej. "¿es un id de agente válido?") sigue
 * viviendo en el manager correspondiente y no se duplica aquí.
 */
export class ApplicationValidator {
  private readonly seenRequestIds = new Set<string>();
  private static readonly MAX_TRACKED_REQUEST_IDS = 5000;

  /** Valida la forma mínima de la solicitud: requestId, operation, payload presentes y con forma válida. */
  assertValidShape(request: ApplicationRequest): void {
    if (!request || typeof request !== "object") {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_REQUEST,
        message: "La solicitud debe ser un objeto.",
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
    this.assertValidRequestId(request.requestId);
    this.assertValidOperationName(request.operation);
    this.assertWithinSizeLimits(request.payload);
  }

  assertValidRequestId(requestId: unknown): asserts requestId is string {
    if (
      typeof requestId !== "string" ||
      requestId.length === 0 ||
      requestId.length > APPLICATION_LIMITS.MAX_REQUEST_ID_LENGTH ||
      !REQUEST_ID_PATTERN.test(requestId)
    ) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_REQUEST_ID,
        message: "requestId es obligatorio y debe ser una cadena corta con caracteres seguros.",
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
  }

  /** Registra `requestId` como visto; lanza si ya se había procesado antes (protección de duplicados). */
  assertNotDuplicateRequestId(requestId: string): void {
    if (this.seenRequestIds.has(requestId)) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_DUPLICATE_REQUEST_ID,
        message: `requestId "${requestId}" ya fue procesado anteriormente.`,
        origin: "validation",
        category: "conflict",
        retryable: false,
        recoverable: true,
      });
    }
    if (this.seenRequestIds.size >= ApplicationValidator.MAX_TRACKED_REQUEST_IDS) {
      const oldest = this.seenRequestIds.values().next().value;
      if (oldest !== undefined) this.seenRequestIds.delete(oldest);
    }
    this.seenRequestIds.add(requestId);
  }

  assertValidOperationName(operation: unknown): asserts operation is string {
    if (
      typeof operation !== "string" ||
      operation.length === 0 ||
      operation.length > APPLICATION_LIMITS.MAX_OPERATION_NAME_LENGTH ||
      !OPERATION_NAME_PATTERN.test(operation)
    ) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_REQUEST,
        message:
          'operation es obligatorio y debe seguir el formato "recurso.accion" (minúsculas, sin espacios).',
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
  }

  /** Recorre el payload comprobando tamaño de cadenas, número de claves y profundidad máxima. */
  assertWithinSizeLimits(payload: unknown): void {
    this.walk(payload, 0);
  }

  private walk(value: unknown, depth: number): void {
    if (depth > APPLICATION_LIMITS.MAX_JSON_DEPTH) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
        message: "El payload supera la profundidad máxima permitida.",
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
    if (typeof value === "string" && value.length > APPLICATION_LIMITS.MAX_STRING_FIELD_LENGTH) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_FIELD_TOO_LARGE,
        message: "Un campo de texto del payload supera el tamaño máximo permitido.",
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
    if (Array.isArray(value)) {
      if (value.length > APPLICATION_LIMITS.MAX_PAYLOAD_KEYS) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_FIELD_TOO_LARGE,
          message: "Un array del payload supera el número máximo de elementos permitido.",
          origin: "validation",
          category: "validation",
          retryable: false,
          recoverable: true,
        });
      }
      for (const item of value) this.walk(item, depth + 1);
      return;
    }
    if (isPlainObject(value)) {
      const keys = Object.keys(value);
      if (keys.length > APPLICATION_LIMITS.MAX_PAYLOAD_KEYS) {
        throw createApplicationError({
          code: ApplicationErrorCode.APP_FIELD_TOO_LARGE,
          message: "Un objeto del payload supera el número máximo de claves permitido.",
          origin: "validation",
          category: "validation",
          retryable: false,
          recoverable: true,
        });
      }
      for (const key of keys) this.walk(value[key], depth + 1);
    }
  }

  /**
   * Comprueba que `value` no contenga secuencias de path traversal (`..`)
   * ni, salvo que se permita explícitamente, rutas absolutas no autorizadas.
   */
  assertSafePathField(
    value: unknown,
    fieldName: string,
    options: { allowAbsolute?: boolean } = {}
  ): void {
    if (value === undefined || value === null) return;
    if (typeof value !== "string") return;

    const normalized = value.replace(/\\/g, "/");
    if (normalized.split("/").includes("..")) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_PATH_TRAVERSAL,
        message: `El campo "${fieldName}" contiene una secuencia de path traversal no permitida.`,
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
        details: { field: fieldName },
      });
    }

    const isAbsolute = normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
    if (isAbsolute && options.allowAbsolute !== true) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_UNAUTHORIZED_ABSOLUTE_PATH,
        message: `El campo "${fieldName}" no admite rutas absolutas no autorizadas.`,
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
        details: { field: fieldName },
      });
    }
  }

  /** Exige confirmación explícita y verificable para operaciones destructivas. */
  assertDestructiveConfirmation(request: ApplicationRequest): void {
    if (request.confirmation?.confirmed !== true) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_CONFIRMATION_REQUIRED,
        message:
          "Esta operación es destructiva y exige confirmación explícita (confirmation.confirmed === true).",
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
  }

  /** Reenvuelve cualquier error de validación no controlado como `ApplicationError` seguro. */
  static wrapUnknown(err: unknown): ApplicationError {
    if (err instanceof ApplicationError) return err;
    return ApplicationError.wrap(err, {
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
    });
  }
}
