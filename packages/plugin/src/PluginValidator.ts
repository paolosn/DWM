import { isValidSemver } from "@dwm/core";
import type { PluginManifest } from "./PluginManifest.js";
import { isValidPluginPermission } from "./PluginPermissions.js";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { createPluginError } from "./errors/PluginError.js";

export interface PluginValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface PluginValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PluginValidationIssue[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Valida la forma y la semántica declarativa de un `PluginManifest`
 * (identificador, nombre, versión, punto de entrada, dependencias,
 * permisos, capacidades, configuración y metadatos), sin ejecutar ningún
 * código del plugin. Devuelve un diagnóstico estructurado en lugar de un
 * simple booleano.
 */
export class PluginValidator {
  validateManifest(manifest: PluginManifest): PluginValidationResult {
    const issues: PluginValidationIssue[] = [];

    if (!manifest || typeof manifest !== "object") {
      return {
        valid: false,
        issues: [{ field: "manifest", message: "El manifiesto debe ser un objeto." }],
      };
    }
    if (!isNonEmptyString(manifest.id)) {
      issues.push({
        field: "id",
        message: "El id del plugin es obligatorio y debe ser una cadena no vacía.",
      });
    }
    if (!isNonEmptyString(manifest.name)) {
      issues.push({
        field: "name",
        message: "El nombre del plugin es obligatorio y debe ser una cadena no vacía.",
      });
    }
    if (!isNonEmptyString(manifest.version) || !isValidSemver(manifest.version)) {
      issues.push({
        field: "version",
        message: `La versión "${String(manifest.version)}" no es un semver válido.`,
      });
    }
    if (!isNonEmptyString(manifest.entryPoint)) {
      issues.push({
        field: "entryPoint",
        message: "El entryPoint es obligatorio y debe ser una cadena no vacía.",
      });
    }
    if (!isNonEmptyString(manifest.minDwmVersion) || !isValidSemver(manifest.minDwmVersion)) {
      issues.push({
        field: "minDwmVersion",
        message: `minDwmVersion "${String(manifest.minDwmVersion)}" no es un semver válido.`,
      });
    }
    if (manifest.maxDwmVersion !== undefined && !isValidSemver(manifest.maxDwmVersion)) {
      issues.push({
        field: "maxDwmVersion",
        message: `maxDwmVersion "${manifest.maxDwmVersion}" no es un semver válido.`,
      });
    }
    if (!Array.isArray(manifest.dependencies)) {
      issues.push({ field: "dependencies", message: "dependencies debe ser un array." });
    } else {
      for (const dependency of manifest.dependencies) {
        if (!dependency || !isNonEmptyString(dependency.pluginId)) {
          issues.push({
            field: "dependencies",
            message: "Cada dependencia debe declarar un pluginId no vacío.",
          });
          continue;
        }
        if (isNonEmptyString(manifest.id) && dependency.pluginId === manifest.id) {
          issues.push({
            field: "dependencies",
            message: `El plugin "${manifest.id}" no puede depender de sí mismo.`,
          });
        }
        if (dependency.minVersion !== undefined && !isValidSemver(dependency.minVersion)) {
          issues.push({
            field: "dependencies",
            message: `minVersion "${dependency.minVersion}" de la dependencia "${dependency.pluginId}" no es un semver válido.`,
          });
        }
      }
    }
    if (
      !Array.isArray(manifest.moduleDependencies) ||
      manifest.moduleDependencies.some((m) => typeof m !== "string")
    ) {
      issues.push({
        field: "moduleDependencies",
        message: "moduleDependencies debe ser un array de cadenas.",
      });
    }
    if (!Array.isArray(manifest.permissions)) {
      issues.push({ field: "permissions", message: "permissions debe ser un array." });
    } else {
      for (const request of manifest.permissions) {
        if (
          !request ||
          !isValidPluginPermission(request.permission) ||
          typeof request.required !== "boolean"
        ) {
          issues.push({
            field: "permissions",
            message:
              "Cada permiso debe declarar { permission, required } con un permiso reconocido.",
          });
        }
      }
    }
    if (!manifest.capabilities || !Array.isArray(manifest.capabilities.provided)) {
      issues.push({ field: "capabilities", message: "capabilities.provided debe ser un array." });
    }
    if (
      manifest.defaultConfiguration !== undefined &&
      typeof manifest.defaultConfiguration !== "object"
    ) {
      issues.push({
        field: "defaultConfiguration",
        message: "defaultConfiguration debe ser un objeto si se indica.",
      });
    }
    if (manifest.metadata !== undefined && typeof manifest.metadata !== "object") {
      issues.push({ field: "metadata", message: "metadata debe ser un objeto si se indica." });
    }

    return { valid: issues.length === 0, issues };
  }

  /** Variante que lanza `PLUGIN_INVALID_MANIFEST` (con los diagnósticos agregados) si el manifiesto no es válido. */
  assertValidManifest(manifest: PluginManifest): void {
    const result = this.validateManifest(manifest);
    if (!result.valid) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_INVALID_MANIFEST,
        message: `Manifiesto inválido: ${result.issues.map((issue) => `[${issue.field}] ${issue.message}`).join("; ")}`,
        origin: "manifest",
        recoverable: true,
      });
    }
  }
}
