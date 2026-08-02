import type { ToolDetectorDefinition } from "./ToolDetector.js";
import { EnvironmentErrorCode } from "./errors/EnvironmentErrorCode.js";
import { createEnvironmentError } from "./errors/EnvironmentError.js";

/**
 * Catálogo en memoria de los detectores de herramienta disponibles
 * (los integrados más cualquiera registrado por el consumidor). No
 * ejecuta nada por sí mismo: solo guarda las definiciones y garantiza
 * que sus ids son únicos, para que un detector personalizado nunca
 * pueda sustituir silenciosamente a uno existente.
 */
export class ToolRegistry {
  private readonly detectors = new Map<string, ToolDetectorDefinition>();

  register(definition: ToolDetectorDefinition): void {
    this.assertValid(definition);
    if (this.detectors.has(definition.id)) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_ALREADY_REGISTERED,
        message: `Ya hay un detector registrado con id "${definition.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.detectors.set(definition.id, definition);
  }

  /** Registra `definition`, sustituyendo cualquier detector previo con el mismo id (a diferencia de `register`, nunca lanza por colisión). */
  registerOrReplace(definition: ToolDetectorDefinition): void {
    this.assertValid(definition);
    this.detectors.set(definition.id, definition);
  }

  unregister(id: string): void {
    this.detectors.delete(id);
  }

  get(id: string): ToolDetectorDefinition | undefined {
    return this.detectors.get(id);
  }

  require(id: string): ToolDetectorDefinition {
    const definition = this.detectors.get(id);
    if (!definition) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_NOT_FOUND,
        message: `No hay ningún detector registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return definition;
  }

  has(id: string): boolean {
    return this.detectors.has(id);
  }

  list(): ToolDetectorDefinition[] {
    return [...this.detectors.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  private assertValid(definition: ToolDetectorDefinition): void {
    const issues: string[] = [];
    if (!definition || typeof definition.id !== "string" || definition.id.trim().length === 0) {
      issues.push("id debe ser una cadena no vacía.");
    }
    if (!definition || typeof definition.name !== "string" || definition.name.trim().length === 0) {
      issues.push("name debe ser una cadena no vacía.");
    }
    if (
      !definition ||
      !Array.isArray(definition.candidates) ||
      definition.candidates.length === 0
    ) {
      issues.push("candidates debe ser un array con al menos un comando candidato.");
    }
    if (issues.length > 0) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_INVALID_DETECTOR,
        message: `Detector de herramienta inválido: ${issues.join("; ")}`,
        origin: "detector",
        recoverable: true,
      });
    }
  }
}
