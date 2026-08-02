import type { ComponentManifest } from "../manifests/ComponentManifest.js";
import { DependencyGraph, type DependencyEdge } from "./DependencyGraph.js";

export type OmissionReason = "omitted-by-dependency" | "omitted-by-cycle";

export type MandatoryFailureReason =
  "missing-dependency" | "capability-unavailable" | "cycle" | "propagated";

export interface MandatoryFailure {
  readonly componentId: string;
  readonly detail: string;
  readonly reason: MandatoryFailureReason;
}

export interface CompositionPlan {
  /** Orden topológico final de los componentes que sí se construirán. */
  readonly order: readonly string[];
  /** Componentes omitidos (opcionales) y la razón de su omisión. */
  readonly omitted: ReadonlyMap<string, OmissionReason>;
  /**
   * Fallos que afectan a un componente crítico (mandatorio, directo o por
   * propagación, TDS-001 §12 punto 3): si esta lista no está vacía, la
   * composición completa debe abortar (CompositionRoot decide el rollback).
   */
  readonly mandatoryFailures: readonly MandatoryFailure[];
}

/**
 * Calcula el cierre de criticidad (TDS-001 §12, punto 3): todo componente
 * marcado `mandatory: true` en su manifiesto, más todo componente del que
 * dependa —de forma transitiva— a través de una capacidad requerida
 * marcada como `mandatory: true` en el requisito.
 */
function computeCriticalSet(
  manifestsById: ReadonlyMap<string, ComponentManifest>,
  edges: readonly DependencyEdge[]
): ReadonlySet<string> {
  const critical = new Set<string>();
  for (const manifest of manifestsById.values()) {
    if (manifest.mandatory) critical.add(manifest.id);
  }

  const mandatoryEdgesFrom = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.mandatory) continue;
    const list = mandatoryEdgesFrom.get(edge.from) ?? [];
    list.push(edge.to);
    mandatoryEdgesFrom.set(edge.from, list);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...critical]) {
      for (const providerId of mandatoryEdgesFrom.get(id) ?? []) {
        if (!critical.has(providerId)) {
          critical.add(providerId);
          changed = true;
        }
      }
    }
  }

  return critical;
}

export function planComposition(
  manifests: readonly ComponentManifest[],
  availableDependencyNames: ReadonlySet<string>
): CompositionPlan {
  const manifestsById = new Map(manifests.map((m) => [m.id, m]));
  const graph = new DependencyGraph(manifests, availableDependencyNames);
  const edges = graph.getEdges();
  const criticalSet = computeCriticalSet(manifestsById, edges);
  const cycleSet = graph.detectCycles();

  const mandatoryFailures: MandatoryFailure[] = [];
  const omitted = new Map<string, OmissionReason>();

  for (const issue of graph.getIssues()) {
    if (!issue.mandatory) continue; // requisito tolerable: no produce fallo alguno.
    if (criticalSet.has(issue.componentId)) {
      mandatoryFailures.push({
        componentId: issue.componentId,
        detail: issue.detail,
        reason: issue.reason,
      });
    } else if (!omitted.has(issue.componentId)) {
      omitted.set(issue.componentId, "omitted-by-dependency");
    }
  }

  for (const id of cycleSet) {
    if (criticalSet.has(id)) {
      mandatoryFailures.push({
        componentId: id,
        detail: `El componente "${id}" participa en una dependencia circular de capacidades.`,
        reason: "cycle",
      });
    } else if (!omitted.has(id)) {
      omitted.set(id, "omitted-by-cycle");
    }
  }

  // Propagación transitiva de la omisión (TDS-001 §12, punto 4): cualquier
  // componente no crítico que dependa (mediante un requisito mandatorio)
  // de un componente ya omitido queda omitido también.
  const dependentsByProvider = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge.mandatory) continue;
    const list = dependentsByProvider.get(edge.to) ?? [];
    list.push(edge.from);
    dependentsByProvider.set(edge.to, list);
  }

  let frontier = [...omitted.keys()];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const providerId of frontier) {
      for (const dependentId of dependentsByProvider.get(providerId) ?? []) {
        if (
          omitted.has(dependentId) ||
          mandatoryFailures.some((f) => f.componentId === dependentId)
        ) {
          continue;
        }
        if (criticalSet.has(dependentId)) {
          mandatoryFailures.push({
            componentId: dependentId,
            detail: `El componente "${dependentId}" depende del componente omitido "${providerId}".`,
            reason: "propagated",
          });
        } else {
          omitted.set(dependentId, "omitted-by-dependency");
          next.push(dependentId);
        }
      }
    }
    frontier = next;
  }

  const excluded = new Set<string>([
    ...omitted.keys(),
    ...mandatoryFailures.map((f) => f.componentId),
  ]);
  const order = mandatoryFailures.length > 0 ? [] : graph.topologicalOrder(excluded);

  return { order, omitted, mandatoryFailures };
}
