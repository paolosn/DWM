import type { EnvironmentSummary, ToolResult } from "./EnvironmentTypes.js";

/**
 * Caché en memoria —nunca persistida, nunca una base de datos— del
 * resultado de la última inspección completa del entorno.
 * `EnvironmentManager` la consulta antes de volver a detectar nada;
 * solo se refresca explícitamente (`invalidate()` o `force: true` en
 * `inspect()`), nunca por temporización implícita salvo que el
 * consumidor configure un refresco periódico con `Scheduler`.
 */
export class EnvironmentRegistry {
  private cachedSummary: EnvironmentSummary | undefined;
  private toolsById = new Map<string, ToolResult>();

  set(summary: EnvironmentSummary): void {
    this.cachedSummary = summary;
    this.toolsById = new Map(summary.tools.map((tool) => [tool.id, tool]));
  }

  get(): EnvironmentSummary | undefined {
    return this.cachedSummary;
  }

  getTool(id: string): ToolResult | undefined {
    return this.toolsById.get(id);
  }

  hasCache(): boolean {
    return this.cachedSummary !== undefined;
  }

  invalidate(): void {
    this.cachedSummary = undefined;
    this.toolsById.clear();
  }
}
