import { EventBusErrorCode } from "./errors/EventBusErrorCode.js";
import { createEventBusError } from "./errors/EventBusError.js";

/**
 * Valida la forma de un patrón de suscripción: segmentos separados por
 * ".", no vacío, sin segmentos vacíos. `*` coincide con exactamente un
 * segmento; `**` coincide con cero o más segmentos.
 */
export function assertValidPattern(pattern: string): void {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw createEventBusError({
      code: EventBusErrorCode.EVENTBUS_INVALID_PATTERN,
      message: `El patrón de suscripción debe ser una cadena no vacía: "${String(pattern)}".`,
      origin: "subscription",
      recoverable: true,
    });
  }
  const segments = pattern.split(".");
  if (segments.some((segment) => segment.length === 0)) {
    throw createEventBusError({
      code: EventBusErrorCode.EVENTBUS_INVALID_PATTERN,
      message: `El patrón de suscripción "${pattern}" contiene segmentos vacíos.`,
      origin: "subscription",
      recoverable: true,
    });
  }
}

function matchSegments(
  patternSegments: readonly string[],
  typeSegments: readonly string[]
): boolean {
  if (patternSegments.length === 0) return typeSegments.length === 0;

  const [head, ...restPattern] = patternSegments;

  if (head === "**") {
    for (let consumed = 0; consumed <= typeSegments.length; consumed += 1) {
      if (matchSegments(restPattern, typeSegments.slice(consumed))) return true;
    }
    return false;
  }

  if (typeSegments.length === 0) return false;
  const [typeHead, ...restType] = typeSegments;
  if (head === "*" || head === typeHead) {
    return matchSegments(restPattern, restType);
  }
  return false;
}

/** Indica si `type` (por ejemplo, "user.created") coincide con `pattern` (por ejemplo, "user.*" o "**"). */
export function matchesPattern(pattern: string, type: string): boolean {
  return matchSegments(pattern.split("."), type.split("."));
}
