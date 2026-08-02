import type { BaseAdapter } from "./BaseAdapter.js";
import type { AdapterConfiguration } from "./AdapterConfiguration.js";
import type { AdapterState } from "./AdapterState.js";
import { isStateTransitionAllowed } from "./AdapterState.js";
import type { AdapterHealth } from "./AdapterHealth.js";
import { AdapterErrorCode } from "./errors/AdapterErrorCode.js";
import { createAdapterError } from "./errors/AdapterError.js";

export interface AdapterRecord {
  readonly adapter: BaseAdapter;
  configuration: AdapterConfiguration;
  state: AdapterState;
  health?: AdapterHealth;
}

/**
 * Registro de adaptadores: mantiene el conjunto de adaptadores dados de
 * alta, su configuración, estado y última salud conocida, y resuelve el
 * orden de inicialización a partir de las dependencias declaradas y la
 * prioridad de cada uno.
 */
export class AdapterRegistry {
  private readonly records = new Map<string, AdapterRecord>();

  register(adapter: BaseAdapter, configuration: AdapterConfiguration): void {
    if (this.records.has(adapter.id)) {
      throw createAdapterError({
        code: AdapterErrorCode.ADAPTER_ALREADY_REGISTERED,
        message: `Ya existe un adaptador registrado con id "${adapter.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(adapter.id, { adapter, configuration, state: "registered" });
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  get(id: string): AdapterRecord | undefined {
    return this.records.get(id);
  }

  require(id: string): AdapterRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createAdapterError({
        code: AdapterErrorCode.ADAPTER_NOT_FOUND,
        message: `No existe ningún adaptador registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  setState(id: string, next: AdapterState): void {
    const record = this.require(id);
    if (!isStateTransitionAllowed(record.state, next)) {
      throw createAdapterError({
        code: AdapterErrorCode.ADAPTER_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setHealth(id: string, health: AdapterHealth): void {
    const record = this.require(id);
    record.health = health;
  }

  clear(): void {
    this.records.clear();
  }

  /**
   * Resuelve el orden de inicialización mediante ordenación topológica de
   * las dependencias declaradas, desempatando por prioridad descendente y,
   * en último término, por id ascendente. Solo considera adaptadores
   * habilitados (`configuration.enabled`).
   */
  resolveInitOrder(): string[] {
    const enabledIds = this.list().filter((id) => this.require(id).configuration.enabled);
    const enabledSet = new Set(enabledIds);

    for (const id of enabledIds) {
      for (const dep of this.require(id).configuration.dependencies) {
        if (!enabledSet.has(dep)) {
          throw createAdapterError({
            code: AdapterErrorCode.ADAPTER_MISSING_DEPENDENCY,
            message: `El adaptador "${id}" depende de "${dep}", que no está registrado y habilitado.`,
            origin: "registry",
            recoverable: true,
          });
        }
      }
    }

    const remaining = new Set(enabledIds);
    const resolved: string[] = [];

    while (remaining.size > 0) {
      const ready = [...remaining].filter((id) =>
        this.require(id).configuration.dependencies.every((dep) => !remaining.has(dep))
      );
      if (ready.length === 0) {
        throw createAdapterError({
          code: AdapterErrorCode.ADAPTER_DEPENDENCY_CYCLE,
          message: `Se detectó un ciclo de dependencias entre adaptadores: ${[...remaining].sort().join(", ")}.`,
          origin: "registry",
          recoverable: true,
        });
      }
      ready.sort((a, b) => {
        const priorityDiff =
          this.require(b).configuration.priority - this.require(a).configuration.priority;
        return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
      });
      for (const id of ready) {
        resolved.push(id);
        remaining.delete(id);
      }
    }

    return resolved;
  }
}
