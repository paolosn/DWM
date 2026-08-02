import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolConfiguration } from "./ToolConfiguration.js";
import type { ToolState } from "./ToolState.js";
import { isToolStateTransitionAllowed } from "./ToolState.js";
import type { ToolHealth } from "./ToolHealth.js";
import { ToolErrorCode } from "./errors/ToolErrorCode.js";
import { createToolError } from "./errors/ToolError.js";

export interface ToolRecord {
  readonly descriptor: ToolDescriptor;
  configuration: ToolConfiguration;
  state: ToolState;
  health?: ToolHealth;
}

/**
 * Registro de herramientas: mantiene el conjunto de herramientas dadas de
 * alta, su configuración, estado y última salud conocida; resuelve el
 * orden de inicialización a partir de dependencias y prioridad, y rastrea
 * qué herramienta está activa en cada grupo exclusivo (resolución de
 * conflictos).
 */
export class ToolRegistry {
  private readonly records = new Map<string, ToolRecord>();

  register(descriptor: ToolDescriptor, configuration: ToolConfiguration): void {
    if (this.records.has(descriptor.id)) {
      throw createToolError({
        code: ToolErrorCode.TOOL_ALREADY_REGISTERED,
        message: `Ya existe una herramienta registrada con id "${descriptor.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(descriptor.id, { descriptor, configuration, state: "registered" });
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  get(id: string): ToolRecord | undefined {
    return this.records.get(id);
  }

  require(id: string): ToolRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createToolError({
        code: ToolErrorCode.TOOL_NOT_FOUND,
        message: `No existe ninguna herramienta registrada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  setState(id: string, next: ToolState): void {
    const record = this.require(id);
    if (!isToolStateTransitionAllowed(record.state, next)) {
      throw createToolError({
        code: ToolErrorCode.TOOL_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setHealth(id: string, health: ToolHealth): void {
    const record = this.require(id);
    record.health = health;
  }

  listActive(): string[] {
    return this.list().filter((id) => this.require(id).state === "active");
  }

  /** Devuelve el id de la herramienta activa en `group`, si existe alguna. */
  getActiveInGroup(group: string): string | undefined {
    return this.listActive().find((id) => this.require(id).configuration.exclusiveGroup === group);
  }

  clear(): void {
    this.records.clear();
  }

  /**
   * Resuelve el orden de inicialización mediante ordenación topológica de
   * las dependencias declaradas, desempatando por prioridad descendente y,
   * en último término, por id ascendente. Solo considera herramientas
   * habilitadas (`configuration.enabled`).
   */
  resolveInitOrder(): string[] {
    const enabledIds = this.list().filter((id) => this.require(id).configuration.enabled);
    const enabledSet = new Set(enabledIds);

    for (const id of enabledIds) {
      for (const dep of this.require(id).configuration.dependencies) {
        if (!enabledSet.has(dep)) {
          throw createToolError({
            code: ToolErrorCode.TOOL_MISSING_DEPENDENCY,
            message: `La herramienta "${id}" depende de "${dep}", que no está registrada y habilitada.`,
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
        throw createToolError({
          code: ToolErrorCode.TOOL_DEPENDENCY_CYCLE,
          message: `Se detectó un ciclo de dependencias entre herramientas: ${[...remaining].sort().join(", ")}.`,
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
