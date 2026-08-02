import {
  isConnectionType,
  isSafeId,
  isSafeName,
  type CreateConnectionRequest,
  type UpdateConnectionRequest,
} from "./ConnectionTypes.js";
import { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";
import { createConnectionError } from "./errors/ConnectionError.js";

/**
 * Validación de forma (no de negocio) de las peticiones que entran al
 * `ConnectionsManager`. Nunca valida contra el disco ni contra un
 * adaptador; eso es responsabilidad de `ConnectionRepository` /
 * `ConnectionTester`.
 */
export class ConnectionValidator {
  assertValidProjectId(projectId: unknown): asserts projectId is string {
    if (!isSafeId(projectId)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: 'El campo "projectId" es obligatorio y debe ser un identificador seguro.',
        origin: "project",
        recoverable: true,
      });
    }
  }

  assertValidProjectPath(projectPath: unknown): asserts projectPath is string {
    if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_PROJECT_PATH,
        message: 'El campo "projectPath" es obligatorio y debe ser una ruta no vacía.',
        origin: "path",
        recoverable: true,
      });
    }
  }

  assertValidId(id: unknown): asserts id is string {
    if (!isSafeId(id)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_ID,
        message: "El identificador proporcionado no es válido.",
        origin: "id",
        recoverable: true,
      });
    }
  }

  assertValidCreateRequest(request: CreateConnectionRequest): void {
    if (!request) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: "La petición de creación de conexión es obligatoria.",
        origin: "request",
        recoverable: true,
      });
    }
    this.assertValidProjectId(request.projectId);
    if (!isSafeName(request.name)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_NAME,
        message: 'El campo "name" es obligatorio, sin separadores de ruta, máximo 200 caracteres.',
        origin: "name",
        recoverable: true,
      });
    }
    if (!isConnectionType(request.type)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_TYPE,
        message: `El tipo de conexión "${String(request.type)}" no es un tipo soportado.`,
        origin: "type",
        recoverable: true,
      });
    }
    if (request.capabilities) {
      this.assertValidCapabilities(request.capabilities);
    }
  }

  assertValidUpdateRequest(request: UpdateConnectionRequest): void {
    if (!request) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_REQUEST,
        message: "La petición de actualización de conexión es obligatoria.",
        origin: "request",
        recoverable: true,
      });
    }
    if (request.name !== undefined && !isSafeName(request.name)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_NAME,
        message: 'El campo "name" no es válido.',
        origin: "name",
        recoverable: true,
      });
    }
    if (request.capabilities) {
      this.assertValidCapabilities(request.capabilities);
    }
  }

  assertValidCapabilities(capabilities: readonly string[]): void {
    for (const capability of capabilities) {
      if (
        typeof capability !== "string" ||
        !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(capability)
      ) {
        throw createConnectionError({
          code: ConnectionErrorCode.CONNECTION_CAPABILITY_UNKNOWN,
          message: `La capacidad "${String(capability)}" no tiene un formato válido ("recurso.accion").`,
          origin: "capability",
          recoverable: true,
        });
      }
    }
  }
}
