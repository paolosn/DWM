import type { ApplicationErrorCategory } from "./ApplicationTypes.js";
import { ApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

/** Forma normalizada y segura que viaja dentro de `ApplicationErrorResponse.error`. */
export interface ApplicationErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly category: ApplicationErrorCategory;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

const SENSITIVE_KEY_PATTERN = /(secret|password|token|apikey|api_key|credential|cipher)/i;

/**
 * Cualquier error de dominio (`AgentError`, `SkillError`, `BackupError`, ...)
 * comparte la misma forma estructural que `DWMError`: `code` (string),
 * `message` (string), `recoverable` (boolean) y opcionalmente `origin`.
 * `ApplicationErrorMapper` reconoce esa forma por duck-typing, sin importar
 * ni depender de las clases concretas de cada paquete (evitaría acoplar la
 * Application API a todos los managers solo para leer errores).
 */
interface DomainErrorLike {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly recoverable?: unknown;
}

function isDomainErrorLike(value: unknown): value is DomainErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string"
  );
}

function categoryFromCode(code: string): ApplicationErrorCategory {
  const upper = code.toUpperCase();
  if (upper.includes("NOT_FOUND")) return "not-found";
  if (
    upper.includes("ALREADY_EXISTS") ||
    upper.includes("CONFLICT") ||
    upper.includes("ALREADY_ARCHIVED") ||
    upper.includes("NOT_ARCHIVED") ||
    upper.includes("VERSION")
  ) {
    return "conflict";
  }
  if (upper.includes("PERMISSION") || upper.includes("DENIED") || upper.includes("FORBIDDEN")) {
    return "permission";
  }
  if (upper.includes("CANCELLED") || upper.includes("CANCELED")) return "cancelled";
  if (upper.includes("UNAVAILABLE") || upper.includes("UNRESOLVABLE")) return "unavailable";
  if (
    upper.includes("INVALID") ||
    upper.includes("VALIDATION") ||
    upper.includes("REQUIRED") ||
    upper.includes("TOO_LARGE") ||
    upper.includes("TRAVERSAL")
  ) {
    return "validation";
  }
  return "internal";
}

/** Elimina de `details` cualquier clave que parezca sensible, de forma recursiva y superficial-segura. */
function sanitizeDetails(
  details: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!details) return undefined;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (typeof value === "object" && value !== null) continue; // no anidar objetos no controlados
    if (typeof value === "string" && value.length > 2000) {
      sanitized[key] = `${value.slice(0, 2000)}…`;
      continue;
    }
    sanitized[key] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Normaliza cualquier valor lanzado (un `ApplicationError`, un error de
 * dominio de otro paquete, o un `Error`/valor nativo desconocido) hacia un
 * `ApplicationErrorPayload` seguro: nunca stack traces, nunca secretos,
 * nunca variables de entorno ni rutas no autorizadas.
 */
export function mapErrorToPayload(err: unknown): ApplicationErrorPayload {
  if (err instanceof ApplicationError) {
    const payload: {
      code: string;
      message: string;
      category: ApplicationErrorCategory;
      retryable: boolean;
      details?: Readonly<Record<string, unknown>>;
    } = {
      code: err.code,
      message: err.message,
      category: err.category,
      retryable: err.retryable,
    };
    const details = sanitizeDetails(err.details);
    if (details) payload.details = details;
    return payload;
  }

  if (isDomainErrorLike(err)) {
    const code = err.code as string;
    const message =
      typeof err.message === "string" && err.message.length > 0
        ? err.message
        : "Ha ocurrido un error en un módulo interno.";
    const retryable = err.recoverable === true;
    return {
      code,
      message,
      category: categoryFromCode(code),
      retryable,
    };
  }

  // Error nativo desconocido u otro valor: nunca se expone el stack ni el
  // mensaje bruto si pudiera contener información sensible; se usa un
  // mensaje seguro y genérico.
  return {
    code: ApplicationErrorCode.APP_INTERNAL_ERROR,
    message: "Ha ocurrido un error interno inesperado.",
    category: "internal",
    retryable: false,
  };
}
