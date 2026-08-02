import type { RuleFilter, RuleSummary } from "./RuleTypes.js";
import { RuleErrorCode } from "./errors/RuleErrorCode.js";
import { createRuleError } from "./errors/RuleError.js";

/**
 * Mantiene en memoria un índice —nunca una base de datos, nunca
 * persistido— de las reglas reales del Workspace, reconstruido por
 * `RuleManager` a partir de `RuleRepository`. Existe únicamente para
 * poder listar, filtrar y buscar sin releer y reparsear todos los
 * ficheros en cada consulta dentro de una misma operación.
 */
export class RuleRegistry {
  private readonly summaries = new Map<string, RuleSummary>();

  set(summary: RuleSummary): void {
    this.summaries.set(summary.id, summary);
  }

  get(id: string): RuleSummary | undefined {
    return this.summaries.get(id);
  }

  has(id: string): boolean {
    return this.summaries.has(id);
  }

  require(id: string): RuleSummary {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw createRuleError({
        code: RuleErrorCode.RULE_NOT_FOUND,
        message: `No hay ninguna regla indexada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return summary;
  }

  delete(id: string): void {
    this.summaries.delete(id);
  }

  /** Sustituye por completo el contenido del índice (usado tras reconstruirlo desde disco). */
  replaceAll(summaries: readonly RuleSummary[]): void {
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.id, summary);
  }

  list(): RuleSummary[] {
    return [...this.summaries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  filter(criteria: RuleFilter): RuleSummary[] {
    return this.list().filter((summary) => {
      if (criteria.archived !== undefined && summary.archived !== criteria.archived) return false;
      return true;
    });
  }

  /** Búsqueda de texto libre, sin distinguir mayúsculas, sobre el id y el título. */
  search(query: string): RuleSummary[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return this.list();
    return this.list().filter((summary) => {
      if (summary.id.toLowerCase().includes(needle)) return true;
      return summary.title?.toLowerCase().includes(needle) ?? false;
    });
  }

  clear(): void {
    this.summaries.clear();
  }
}
