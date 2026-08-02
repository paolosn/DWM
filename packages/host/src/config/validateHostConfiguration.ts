import type { HostConfiguration } from "./HostConfiguration.js";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError } from "../errors/HostError.js";

function fail(message: string): never {
  throw createHostError({
    code: HostErrorCode.HOST_INVALID_CONFIGURATION,
    message,
    origin: "configuration",
    recoverable: false,
  });
}

/**
 * Valida la forma de `HostConfiguration` (TDS-001 §4, paso 1). Un error aquí
 * es siempre no recuperable: ningún paso posterior se ejecuta.
 */
export function validateHostConfiguration(config: HostConfiguration): void {
  if (!config || typeof config !== "object") {
    fail("HostConfiguration es obligatoria y debe ser un objeto.");
  }
  if (typeof config.workspaceRoot !== "string" || config.workspaceRoot.trim().length === 0) {
    fail("HostConfiguration.workspaceRoot es obligatorio y debe ser una cadena no vacía.");
  }
  if (!Array.isArray(config.components)) {
    fail("HostConfiguration.components debe ser un array.");
  }

  const seenIds = new Set<string>();
  for (const descriptor of config.components) {
    if (!descriptor || typeof descriptor !== "object") {
      fail("HostConfiguration.components contiene un descriptor inválido.");
    }
    if (!descriptor.manifest || typeof descriptor.manifest.id !== "string") {
      fail("HostConfiguration.components contiene un descriptor sin manifiesto o sin id.");
    }
    if (seenIds.has(descriptor.manifest.id)) {
      fail(`HostConfiguration.components declara el id duplicado "${descriptor.manifest.id}".`);
    }
    seenIds.add(descriptor.manifest.id);
    if (!descriptor.factory || typeof descriptor.factory.build !== "function") {
      fail(
        `El componente "${descriptor.manifest.id}" no declara una fábrica válida (falta build()).`
      );
    }
    if (typeof descriptor.enabled !== "boolean") {
      fail(`El componente "${descriptor.manifest.id}" debe declarar "enabled" como booleano.`);
    }
  }

  if (!config.dependencyProviders || typeof config.dependencyProviders !== "object") {
    fail("HostConfiguration.dependencyProviders debe ser un objeto.");
  }
  for (const [name, provider] of Object.entries(config.dependencyProviders)) {
    if (typeof provider !== "function") {
      fail(`HostConfiguration.dependencyProviders["${name}"] debe ser una función.`);
    }
  }

  if (!Array.isArray(config.useCases)) {
    fail("HostConfiguration.useCases debe ser un array.");
  }
  const seenUseCaseIds = new Set<string>();
  for (const useCase of config.useCases) {
    if (!useCase || typeof useCase.id !== "string" || useCase.id.trim().length === 0) {
      fail("HostConfiguration.useCases contiene un caso de uso sin id válido.");
    }
    if (seenUseCaseIds.has(useCase.id)) {
      fail(`HostConfiguration.useCases declara el id duplicado "${useCase.id}".`);
    }
    seenUseCaseIds.add(useCase.id);
    if (!Array.isArray(useCase.requiredComponentIds)) {
      fail(`El caso de uso "${useCase.id}" debe declarar "requiredComponentIds" como un array.`);
    }
    if (typeof useCase.handle !== "function") {
      fail(`El caso de uso "${useCase.id}" debe declarar "handle" como función.`);
    }
  }
}
