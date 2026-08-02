import { ConfigErrorCode } from "./errors/ConfigErrorCode.js";
import { createConfigError } from "./errors/ConfigError.js";

const VALID_NAMESPACE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Valida que `namespace` sea un identificador seguro para usarse como nombre de fichero. */
export function assertValidNamespace(namespace: string): void {
  if (typeof namespace !== "string" || namespace.length === 0 || !VALID_NAMESPACE.test(namespace)) {
    throw createConfigError({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
      message: `Namespace de configuración inválido: "${String(namespace)}".`,
      origin: "namespace",
      recoverable: true,
    });
  }
  if (namespace.includes("..")) {
    throw createConfigError({
      code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE,
      message: `Namespace de configuración inválido: "${namespace}".`,
      origin: "namespace",
      recoverable: true,
    });
  }
}
