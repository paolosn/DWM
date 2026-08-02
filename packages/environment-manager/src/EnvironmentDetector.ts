import { ToolDetector, isAbortError, type ToolDetectionContext } from "./ToolDetector.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import type { ToolResult } from "./EnvironmentTypes.js";
import { EnvironmentErrorCode } from "./errors/EnvironmentErrorCode.js";
import { createEnvironmentError } from "./errors/EnvironmentError.js";

/**
 * Ejecuta la detección de todas las herramientas de un `ToolRegistry`
 * en paralelo, aislando el fallo de una herramienta del resto: un
 * detector que lance una excepción inesperada (no relacionada con
 * cancelación) se traduce en un `ToolResult` de estado `invalid`, no
 * en un fallo de toda la inspección. Solo la cancelación explícita vía
 * `AbortSignal` interrumpe la inspección completa.
 */
export class EnvironmentDetector {
  private readonly toolDetector = new ToolDetector();

  async detectAll(
    registry: ToolRegistry,
    context: ToolDetectionContext
  ): Promise<readonly ToolResult[]> {
    if (context.signal?.aborted) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_INSPECTION_CANCELLED,
        message: "La inspección del entorno se canceló antes de empezar.",
        origin: "inspection",
        recoverable: true,
      });
    }

    const definitions = registry.list();
    try {
      return await Promise.all(
        definitions.map((definition) => this.detectOne(definition, context))
      );
    } catch (err) {
      throw createEnvironmentError({
        code: EnvironmentErrorCode.ENVIRONMENT_INSPECTION_CANCELLED,
        message: "La inspección del entorno se canceló.",
        origin: "inspection",
        recoverable: true,
        cause: err,
      });
    }
  }

  private async detectOne(
    definition: Parameters<ToolDetector["detect"]>[0],
    context: ToolDetectionContext
  ): Promise<ToolResult> {
    try {
      return await this.toolDetector.detect(definition, context);
    } catch (err) {
      if (isAbortError(err)) throw err;
      return {
        id: definition.id,
        name: definition.name,
        category: definition.category,
        status: "invalid",
        reason: "spawn-error",
        message: "La detección falló de forma inesperada.",
        durationMs: 0,
      };
    }
  }
}
