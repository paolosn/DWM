import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";
import { ApplicationValidator } from "./ApplicationValidator.js";

/** Instancia sin estado relevante para comprobaciones de rutas, reutilizada por todos los controladores. */
export const boundaryValidator = new ApplicationValidator();

function invalidPayload(message: string): never {
  throw createApplicationError({
    code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
    message,
    origin: "validation",
    category: "validation",
    retryable: false,
    recoverable: true,
  });
}

export function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    invalidPayload("El payload debe ser un objeto.");
  }
  return payload as Record<string, unknown>;
}

export function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    invalidPayload(`El campo "${key}" es obligatorio y debe ser una cadena no vacía.`);
  }
  return value;
}

export function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    invalidPayload(`El campo "${key}" debe ser una cadena si se proporciona.`);
  }
  return value;
}

export function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    invalidPayload(`El campo "${key}" debe ser booleano si se proporciona.`);
  }
  return value;
}

export function requireRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const value = record[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidPayload(`El campo "${key}" es obligatorio y debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

export function optionalStringArray(
  record: Record<string, unknown>,
  key: string
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    invalidPayload(`El campo "${key}" debe ser un array de cadenas si se proporciona.`);
  }
  return value as readonly string[];
}

/** Valida que un campo de ruta, si está presente, sea seguro (sin path traversal ni ruta absoluta no autorizada). */
export function assertSafeOptionalPath(
  record: Record<string, unknown>,
  key: string,
  options: { allowAbsolute?: boolean } = {}
): void {
  boundaryValidator.assertSafePathField(record[key], key, options);
}
