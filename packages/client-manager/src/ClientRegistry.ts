import type { ClientFilter, ClientSummary } from "./ClientTypes.js";
import { ClientErrorCode } from "./errors/ClientErrorCode.js";
import { createClientError } from "./errors/ClientError.js";

/**
 * Mantiene en memoria un índice —nunca una base de datos, nunca
 * persistido— de los clientes reales del Workspace, reconstruido por
 * `ClientManager` a partir de `ClientRepository`. Existe únicamente
 * para poder listar, filtrar, buscar y detectar colisiones de `slug`
 * sin releer y reparsear todos los ficheros en cada consulta dentro de
 * una misma operación.
 */
export class ClientRegistry {
  private readonly summaries = new Map<string, ClientSummary>();

  set(summary: ClientSummary): void {
    this.summaries.set(summary.id, summary);
  }

  get(id: string): ClientSummary | undefined {
    return this.summaries.get(id);
  }

  has(id: string): boolean {
    return this.summaries.has(id);
  }

  require(id: string): ClientSummary {
    const summary = this.summaries.get(id);
    if (!summary) {
      throw createClientError({
        code: ClientErrorCode.CLIENT_NOT_FOUND,
        message: `No hay ningún cliente indexado con id "${id}".`,
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
  replaceAll(summaries: readonly ClientSummary[]): void {
    this.summaries.clear();
    for (const summary of summaries) this.summaries.set(summary.id, summary);
  }

  list(): ClientSummary[] {
    return [...this.summaries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Busca un cliente por `slug`, sin distinguir mayúsculas. `excludeId`, si se indica, ignora ese id (útil al editar el propio cliente). */
  findBySlug(slug: string, excludeId?: string): ClientSummary | undefined {
    const needle = slug.toLowerCase();
    return this.list().find(
      (summary) => summary.id !== excludeId && summary.slug.toLowerCase() === needle
    );
  }

  filter(criteria: ClientFilter): ClientSummary[] {
    const wantedTags = (criteria.tags ?? []).map((tag) => tag.trim().toLowerCase());
    return this.list().filter((summary) => {
      if (criteria.archived !== undefined && summary.archived !== criteria.archived) return false;
      if (criteria.status !== undefined && summary.status !== criteria.status) return false;
      if (wantedTags.length > 0 && !wantedTags.every((tag) => summary.tags.includes(tag))) {
        return false;
      }
      return true;
    });
  }

  /** Búsqueda de texto libre, sin distinguir mayúsculas, sobre id, nombre, slug y etiquetas. */
  search(query: string): ClientSummary[] {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return this.list();
    return this.list().filter((summary) => {
      if (summary.id.toLowerCase().includes(needle)) return true;
      if (summary.name.toLowerCase().includes(needle)) return true;
      if (summary.slug.toLowerCase().includes(needle)) return true;
      return summary.tags.some((tag) => tag.includes(needle));
    });
  }

  /** Todas las etiquetas distintas presentes en el índice, ordenadas. */
  listTags(): string[] {
    const tags = new Set<string>();
    for (const summary of this.summaries.values()) {
      for (const tag of summary.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  clear(): void {
    this.summaries.clear();
  }
}
