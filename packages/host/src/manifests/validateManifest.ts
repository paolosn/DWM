import { isValidSemver } from "@dwm/core";
import type { ComponentManifest } from "./ComponentManifest.js";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError } from "../errors/HostError.js";

function isNonEmptyTrimmed(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

/**
 * Valida la forma de un manifiesto individual (TDS-001 §4, paso 2 y paso 3):
 * identidad, versiones semánticas, forma de las capacidades declaradas y de
 * las dependencias externas requeridas. No comprueba nada relativo a otros
 * manifiestos (eso es responsabilidad del grafo de dependencias, §4 paso 4-5).
 */
export function validateManifestShape(manifest: ComponentManifest): void {
  if (!isNonEmptyTrimmed(manifest?.id)) {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto tiene un "id" ausente, vacío o con espacios: "${String(manifest?.id)}".`,
      recoverable: true,
      origin: "manifest",
    });
  }

  if (manifest.kind !== "module" && manifest.kind !== "adapter") {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto "${manifest.id}" declara un "kind" no soportado: "${String(
        (manifest as { kind?: unknown }).kind
      )}".`,
      recoverable: true,
      origin: "manifest",
    });
  }

  if (manifest.kind === "adapter" && !isNonEmptyTrimmed(manifest.subjectId)) {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto de adaptador "${manifest.id}" requiere un "subjectId" no vacío.`,
      recoverable: true,
      origin: "manifest",
    });
  }

  for (const field of ["version", "contractVersion", "manifestVersion"] as const) {
    const value = manifest[field];
    if (typeof value !== "string" || !isValidSemver(value)) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_MANIFEST,
        message: `El manifiesto "${manifest.id}" declara "${field}" con un formato semántico inválido: "${String(
          value
        )}".`,
        recoverable: true,
        origin: "manifest",
      });
    }
  }

  if (typeof manifest.mandatory !== "boolean") {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto "${manifest.id}" debe declarar "mandatory" como booleano.`,
      recoverable: true,
      origin: "manifest",
    });
  }

  if (!Array.isArray(manifest.providedCapabilities)) {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto "${manifest.id}" debe declarar "providedCapabilities" como un array.`,
      recoverable: true,
      origin: "manifest",
    });
  }
  for (const capability of manifest.providedCapabilities) {
    if (!isNonEmptyTrimmed(capability?.name) || !isValidSemver(capability?.version)) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_MANIFEST,
        message: `El manifiesto "${manifest.id}" declara una capacidad provista inválida.`,
        recoverable: true,
        origin: "manifest",
      });
    }
  }

  if (!Array.isArray(manifest.requiredCapabilities)) {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto "${manifest.id}" debe declarar "requiredCapabilities" como un array.`,
      recoverable: true,
      origin: "manifest",
    });
  }
  for (const requirement of manifest.requiredCapabilities) {
    if (
      !isNonEmptyTrimmed(requirement?.name) ||
      !isValidSemver(requirement?.version) ||
      typeof requirement?.mandatory !== "boolean"
    ) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_MANIFEST,
        message: `El manifiesto "${manifest.id}" declara una capacidad requerida inválida.`,
        recoverable: true,
        origin: "manifest",
      });
    }
  }

  if (!Array.isArray(manifest.requiredDependencies)) {
    throw createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: `El manifiesto "${manifest.id}" debe declarar "requiredDependencies" como un array.`,
      recoverable: true,
      origin: "manifest",
    });
  }
  for (const dependencyName of manifest.requiredDependencies) {
    if (!isNonEmptyTrimmed(dependencyName)) {
      throw createHostError({
        code: HostErrorCode.HOST_INVALID_MANIFEST,
        message: `El manifiesto "${manifest.id}" declara una dependencia externa requerida inválida.`,
        recoverable: true,
        origin: "manifest",
      });
    }
  }
}
