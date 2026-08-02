import type { SystemInfoProvider } from "./SystemInfoProvider.js";
import { EnvironmentErrorCode } from "./errors/EnvironmentErrorCode.js";
import { createEnvironmentError } from "./errors/EnvironmentError.js";

/**
 * Catálogo cerrado de variables de entorno que este módulo está
 * autorizado a leer y exponer. Deliberadamente pequeño y compuesto
 * únicamente por variables que describen el entorno de ejecución (no
 * credenciales, tokens, rutas privadas ni configuración de negocio).
 * Cualquier variable fuera de esta lista se rechaza explícitamente,
 * nunca se expone "por si acaso".
 */
export const AUTHORIZED_ENVIRONMENT_VARIABLES = [
  "PATH",
  "Path",
  "SHELL",
  "COMSPEC",
  "PATHEXT",
  "TERM_PROGRAM",
  "TERM",
  "VIRTUAL_ENV",
  "CONDA_DEFAULT_ENV",
  "OS",
] as const;

export type AuthorizedEnvironmentVariable = (typeof AUTHORIZED_ENVIRONMENT_VARIABLES)[number];

export function isAuthorizedEnvironmentVariable(
  name: string
): name is AuthorizedEnvironmentVariable {
  return (AUTHORIZED_ENVIRONMENT_VARIABLES as readonly string[]).includes(name);
}

/**
 * Puerta única de lectura de variables de entorno para todo el
 * módulo: nunca se lee `SystemInfoProvider.env()` directamente fuera
 * de esta clase salvo para las variables técnicas de resolución de
 * `PATH` en `ProcessRunner` (que nunca se exponen al consumidor). Toda
 * consulta pasa por el catálogo cerrado — no hay forma de leer una
 * variable arbitraria a través de la API pública.
 */
export class EnvironmentVariables {
  constructor(private readonly systemInfo: SystemInfoProvider) {}

  listAuthorizedNames(): readonly AuthorizedEnvironmentVariable[] {
    return AUTHORIZED_ENVIRONMENT_VARIABLES;
  }

  /** Verdadero si `name` está en el catálogo autorizado (independientemente de si tiene valor). */
  isAuthorized(name: string): boolean {
    return isAuthorizedEnvironmentVariable(name);
  }

  /** Devuelve el valor de una variable autorizada, o `undefined` si no está definida. Lanza `ENVIRONMENT_VARIABLE_NOT_AUTHORIZED` si `name` no está en el catálogo. */
  get(name: string): string | undefined {
    if (!isAuthorizedEnvironmentVariable(name)) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_VARIABLE_NOT_AUTHORIZED,
        message: `"${name}" no es una variable de entorno autorizada. Variables disponibles: ${AUTHORIZED_ENVIRONMENT_VARIABLES.join(", ")}.`,
        origin: "variable",
        recoverable: true,
      });
    }
    return this.systemInfo.env(name);
  }

  /** Verdadero si `name` está autorizada y definida (sin exponer su valor). */
  isPresent(name: string): boolean {
    return this.isAuthorized(name) && this.systemInfo.env(name) !== undefined;
  }
}
