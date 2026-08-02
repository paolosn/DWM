import { isContractCompatible } from "@dwm/core";
import type { ComponentManifest } from "../manifests/ComponentManifest.js";
import { HostErrorCode } from "../errors/HostErrorCatalog.js";
import { createHostError } from "../errors/HostError.js";

export interface DependencyEdge {
  /** id del componente que requiere la capacidad. */
  readonly from: string;
  /** id del componente que la provee. */
  readonly to: string;
  readonly capabilityName: string;
  readonly mandatory: boolean;
}

export interface GraphIssue {
  readonly componentId: string;
  readonly reason: "missing-dependency" | "capability-unavailable";
  readonly detail: string;
  readonly mandatory: boolean;
}

/**
 * Grafo de dependencias entre manifiestos (TDS-001 §4, pasos 4-6). Se
 * construye exclusivamente a partir de las capacidades provistas/requeridas
 * y de las dependencias externas declaradas; no construye ni invoca ninguna
 * fábrica.
 */
export class DependencyGraph {
  private readonly manifestsById: ReadonlyMap<string, ComponentManifest>;
  private readonly edges: DependencyEdge[] = [];
  private readonly issues: GraphIssue[] = [];

  constructor(
    manifests: readonly ComponentManifest[],
    private readonly availableDependencyNames: ReadonlySet<string>
  ) {
    this.manifestsById = new Map(manifests.map((m) => [m.id, m]));
    this.build();
  }

  private build(): void {
    for (const manifest of this.manifestsById.values()) {
      for (const requirement of manifest.requiredCapabilities) {
        const provider = this.findProvider(requirement.name, requirement.version);
        if (!provider) {
          this.issues.push({
            componentId: manifest.id,
            reason: "capability-unavailable",
            detail: `Ningún componente habilitado provee la capacidad requerida "${requirement.name}" en una versión compatible con "${requirement.version}".`,
            mandatory: requirement.mandatory,
          });
          continue;
        }
        this.edges.push({
          from: manifest.id,
          to: provider.id,
          capabilityName: requirement.name,
          mandatory: requirement.mandatory,
        });
      }

      for (const dependencyName of manifest.requiredDependencies) {
        if (!this.availableDependencyNames.has(dependencyName)) {
          this.issues.push({
            componentId: manifest.id,
            reason: "missing-dependency",
            detail: `La dependencia externa "${dependencyName}" no está disponible en HostConfiguration.dependencyProviders.`,
            mandatory: true,
          });
        }
      }
    }
  }

  private findProvider(name: string, requiredVersion: string): ComponentManifest | undefined {
    for (const candidate of this.manifestsById.values()) {
      const provided = candidate.providedCapabilities.find((c) => c.name === name);
      if (provided && isContractCompatible(requiredVersion, provided.version)) {
        return candidate;
      }
    }
    return undefined;
  }

  /** Ausencias y capacidades incompatibles detectadas (TDS-001 §4 paso 5). */
  getIssues(): readonly GraphIssue[] {
    return this.issues;
  }

  /** Aristas capacidad-requerida → capacidad-provista ya resueltas. */
  getEdges(): readonly DependencyEdge[] {
    return this.edges;
  }

  /**
   * Detecta ciclos entre componentes (a través de aristas de capacidad
   * requerida→provista) mediante DFS de tres colores. Devuelve el conjunto
   * de ids de componentes que participan en al menos un ciclo.
   */
  detectCycles(): ReadonlySet<string> {
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const id of this.manifestsById.keys()) color.set(id, WHITE);

    const inCycle = new Set<string>();
    const stack: string[] = [];

    const adjacency = new Map<string, string[]>();
    for (const edge of this.edges) {
      const list = adjacency.get(edge.from) ?? [];
      list.push(edge.to);
      adjacency.set(edge.from, list);
    }

    const visit = (id: string): void => {
      color.set(id, GRAY);
      stack.push(id);
      for (const next of adjacency.get(id) ?? []) {
        const state = color.get(next);
        if (state === GRAY) {
          const cycleStart = stack.indexOf(next);
          for (const cycleId of stack.slice(cycleStart)) {
            inCycle.add(cycleId);
          }
        } else if (state === WHITE) {
          visit(next);
        }
      }
      stack.pop();
      color.set(id, BLACK);
    };

    for (const id of this.manifestsById.keys()) {
      if (color.get(id) === WHITE) visit(id);
    }

    return inCycle;
  }

  /**
   * Orden topológico de composición (TDS-001 §4 paso 6): un componente
   * nunca se construye antes que aquello de lo que depende. `excluded` son
   * ids que no deben aparecer en el orden (omitidos por configuración,
   * ausencia de dependencias, o participación en un ciclo).
   */
  topologicalOrder(excluded: ReadonlySet<string>): readonly string[] {
    const remainingIds = [...this.manifestsById.keys()].filter((id) => !excluded.has(id));
    const remaining = new Set(remainingIds);

    const dependencyCount = new Map<string, number>();
    for (const id of remainingIds) dependencyCount.set(id, 0);
    for (const edge of this.edges) {
      if (remaining.has(edge.from) && remaining.has(edge.to)) {
        dependencyCount.set(edge.from, (dependencyCount.get(edge.from) ?? 0) + 1);
      }
    }

    const dependents = new Map<string, string[]>();
    for (const edge of this.edges) {
      if (!remaining.has(edge.from) || !remaining.has(edge.to)) continue;
      const list = dependents.get(edge.to) ?? [];
      list.push(edge.from);
      dependents.set(edge.to, list);
    }

    const ready = remainingIds.filter((id) => (dependencyCount.get(id) ?? 0) === 0).sort();
    const order: string[] = [];

    while (ready.length > 0) {
      const id = ready.shift()!;
      order.push(id);
      const affected = (dependents.get(id) ?? []).sort();
      for (const dependent of affected) {
        const remainingCount = (dependencyCount.get(dependent) ?? 0) - 1;
        dependencyCount.set(dependent, remainingCount);
        if (remainingCount === 0) {
          ready.push(dependent);
          ready.sort();
        }
      }
    }

    if (order.length !== remainingIds.length) {
      // No debería alcanzarse: los ciclos ya se excluyeron explícitamente
      // antes de invocar este método (ver CompositionRoot).
      throw createHostError({
        code: HostErrorCode.HOST_CIRCULAR_DEPENDENCY,
        message:
          "No fue posible determinar un orden topológico completo tras excluir los ciclos conocidos.",
        origin: "composition",
        recoverable: false,
      });
    }

    return order;
  }
}
