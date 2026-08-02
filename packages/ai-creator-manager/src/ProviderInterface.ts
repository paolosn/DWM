import type { CreationKind } from "./CreationTypes.js";
import { CreationErrorCode } from "./errors/CreationErrorCode.js";
import { createCreationError } from "./errors/CreationError.js";

/**
 * Petición de generación dirigida a un proveedor de IA. Este módulo
 * (Módulo 30) NO implementa ningún proveedor real todavía (ni OpenAI, ni
 * Claude, ni Gemini, ni Ollama, ni DeepSeek): esta interfaz existe
 * únicamente para que `CreationPipeline` y `AICreatorManager` puedan
 * invocar proveedores intercambiables en el futuro sin cambiar su
 * núcleo, registrándolos mediante `AICreatorManager.registerProvider()`.
 */
export interface AIGenerationRequest {
  readonly kind: CreationKind;
  readonly prompt: string;
  readonly variables?: Readonly<Record<string, string>>;
}

export interface AIGenerationResult {
  readonly content: string;
  readonly raw?: unknown;
}

/** Contrato público que debe implementar cualquier proveedor de IA conectable. */
export interface AIProvider {
  readonly id: string;
  generate(request: AIGenerationRequest): Promise<AIGenerationResult>;
}

/**
 * Proveedor por defecto: siempre falla explícitamente con
 * `CREATION_PROVIDER_NOT_IMPLEMENTED`. Deja la arquitectura preparada
 * para proveedores reales sin dar la falsa impresión de que ya generan
 * contenido mediante IA — mientras no se registre un proveedor real,
 * toda creación debe resolverse por plantilla o de forma manual.
 */
export class NullAIProvider implements AIProvider {
  readonly id: string;

  constructor(id = "null") {
    this.id = id;
  }

  generate(_request: AIGenerationRequest): Promise<AIGenerationResult> {
    throw createCreationError({
      code: CreationErrorCode.CREATION_PROVIDER_NOT_IMPLEMENTED,
      message:
        `El proveedor de IA "${this.id}" todavía no está implementado en este módulo. ` +
        "Módulo 30 (AI Creator Manager) solo orquesta el proceso de creación: las llamadas " +
        "reales a proveedores de IA (OpenAI, Claude, Gemini, Ollama, DeepSeek u otros) se " +
        "incorporarán en un módulo posterior. Usa una plantilla o contenido manual mientras tanto.",
      origin: "provider",
      recoverable: true,
    });
  }
}
