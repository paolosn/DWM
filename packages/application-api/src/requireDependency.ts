import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

/**
 * Exige que una dependencia opcional del `ApplicationContext` esté presente
 * antes de delegar en ella. Ningún controlador debe acceder a un manager sin
 * pasar por aquí: así toda ausencia se normaliza como
 * `APP_DEPENDENCY_UNAVAILABLE` en lugar de un `TypeError` crudo.
 */
export function requireDependency<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw createApplicationError({
      code: ApplicationErrorCode.APP_DEPENDENCY_UNAVAILABLE,
      message: `La dependencia "${name}" no está disponible en este contexto de la Application API.`,
      origin: "dependency",
      category: "unavailable",
      retryable: false,
      recoverable: true,
      details: { dependency: name },
    });
  }
  return value;
}
