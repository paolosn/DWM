import type { SkillFilter, SkillSummary } from "./SkillTypes.js";
import { SkillErrorCode } from "./errors/SkillErrorCode.js";
import { createSkillError } from "./errors/SkillError.js";

/**
 * Mantiene en memoria un índice —nunca una base de datos, nunca
 * persistido— de las skills reales del Workspace, reconstruido por
 * `SkillManager` a partir de `SkillRepository`. Existe únicamente para
 * poder listar, filtrar y buscar sin releer y reparsear todos los
 * `SKILL.md` en cada consulta dentro de una misma operación.
 */
export class SkillRegistry {
  private readonly summaries = new Map<string, SkillSummary>();

  set(summary: SkillSummary): void {
    this.summaries.set(summary.id, summary);
  }

  get(id: string): SkillSummary | undefined {
    return this.summaries.get(id);
  }

  has(id: string): boolean {
    return this.summaries.has(id);
  }

  require(id: string): SkillSummary {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw createSkillError({
        code: SkillErrorCode.SKILL_NOT_FOUND,
        message: `No hay ninguna skill indexada con id "${id}".`,
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
  replaceAll(summaries: readonly SkillSummary[]): void {
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.id, summary);
  }

  list(): SkillSummary[] {
    return [...this.summaries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  filter(criteria: SkillFilter): SkillSummary[] {
    return this.list().filter((summary) => {
      if (criteria.archived !== undefined && summary.archived !== criteria.archived) return false;
      return true;
    });
  }

  /** Búsqueda de texto libre, sin distinguir mayúsculas, sobre el id y el título. */
  search(query: string): SkillSummary[] {
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
