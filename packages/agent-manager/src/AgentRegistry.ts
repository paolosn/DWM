import type { AgentFilter, AgentSummary } from "./AgentTypes.js";
import { AgentErrorCode } from "./errors/AgentErrorCode.js";
import { createAgentError } from "./errors/AgentError.js";

/**
 * Mantiene en memoria un índice —nunca una base de datos, nunca
 * persistido— de los agentes reales del Workspace, reconstruido por
 * `AgentManager` a partir de `AgentRepository`. Existe únicamente para
 * poder listar, filtrar y buscar sin releer y reparsear todos los
 * ficheros en cada consulta dentro de una misma operación.
 */
export class AgentRegistry {
  private readonly summaries = new Map<string, AgentSummary>();

  set(summary: AgentSummary): void {
    this.summaries.set(summary.id, summary);
  }

  get(id: string): AgentSummary | undefined {
    return this.summaries.get(id);
  }

  has(id: string): boolean {
    return this.summaries.has(id);
  }

  require(id: string): AgentSummary {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw createAgentError({
        code: AgentErrorCode.AGENT_NOT_FOUND,
        message: `No hay ningún agente indexado con id "${id}".`,
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
  replaceAll(summaries: readonly AgentSummary[]): void {
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.id, summary);
  }

  list(): AgentSummary[] {
    return [...this.summaries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  filter(criteria: AgentFilter): AgentSummary[] {
    return this.list().filter((summary) => {
      if (criteria.archived !== undefined && summary.archived !== criteria.archived) return false;
      if (criteria.tags && criteria.tags.length > 0) {
        const summaryTags = new Set(summary.tags ?? []);
        if (!criteria.tags.every((tag) => summaryTags.has(tag))) return false;
      }
      return true;
    });
  }

  /** Búsqueda de texto libre, sin distinguir mayúsculas, sobre el id, el nombre y las etiquetas. */
  search(query: string): AgentSummary[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return this.list();
    return this.list().filter((summary) => {
      if (summary.id.toLowerCase().includes(needle)) return true;
      if (summary.name?.toLowerCase().includes(needle)) return true;
      return (summary.tags ?? []).some((tag) => tag.toLowerCase().includes(needle));
    });
  }

  clear(): void {
    this.summaries.clear();
  }
}
