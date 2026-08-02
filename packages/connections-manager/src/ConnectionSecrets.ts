import type { SafeConnectionError } from "./ConnectionTypes.js";

const MASK = "••••••••";

/**
 * Redacción defensiva (README "Seguridad"): sustituye, en un mensaje de
 * error o diagnóstico, cualquier ocurrencia literal de un valor de
 * secreto resuelto por una máscara fija. Se aplica siempre antes de
 * persistir `lastError`, publicar un evento o devolver un resultado de
 * prueba — nunca se asume que el origen del texto ya viene limpio.
 */
export function redactSecretValues(
  text: string,
  resolvedSecrets: Readonly<Record<string, string>>
): string {
  let redacted = text;
  for (const value of Object.values(resolvedSecrets)) {
    if (!value) continue;
    redacted = redacted.split(value).join(MASK);
  }
  return redacted;
}

export function toSafeError(
  code: string,
  message: string,
  resolvedSecrets: Readonly<Record<string, string>> = {}
): SafeConnectionError {
  return {
    code,
    message: redactSecretValues(message, resolvedSecrets),
    timestamp: new Date().toISOString(),
  };
}

/** Máscara mostrada en la UI/diagnóstico para un valor de secreto ya existente; nunca el valor real. */
export function maskedSecretPreview(): string {
  return MASK;
}
