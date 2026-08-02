import type { PluginManifest } from "./PluginManifest.js";
import type { PluginMetadata } from "./PluginMetadata.js";
import type { PluginConfiguration } from "./PluginConfiguration.js";
import { isPluginStateTransitionAllowed, type PluginState } from "./PluginState.js";
import type { PluginHealth } from "./PluginHealth.js";
import type { PluginPermission } from "./PluginPermissions.js";
import type { PluginDescriptor } from "./PluginDescriptor.js";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { createPluginError } from "./errors/PluginError.js";

export interface PluginRecord {
  manifest: PluginManifest;
  metadata: PluginMetadata;
  configuration: PluginConfiguration;
  grantedPermissions: readonly PluginPermission[];
  state: PluginState;
  health?: PluginHealth;
}

/**
 * Registro central de plugins: mantiene el conjunto de plugins dados de
 * alta, su configuración, permisos concedidos, estado y última salud
 * conocida; resuelve el orden de activación a partir de las dependencias
 * obligatorias declaradas, y localiza dependientes activos para proteger
 * la desinstalación/desactivación.
 */
export class PluginRegistry {
  private readonly records = new Map<string, PluginRecord>();

  register(
    manifest: PluginManifest,
    metadata: PluginMetadata,
    configuration: PluginConfiguration,
    grantedPermissions: readonly PluginPermission[] = [],
    initialState: PluginState = "registered"
  ): void {
    if (this.records.has(manifest.id)) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_ALREADY_REGISTERED,
        message: `Ya existe un plugin registrado con id "${manifest.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(manifest.id, {
      manifest,
      metadata,
      configuration,
      grantedPermissions,
      state: initialState,
    });
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  get(id: string): PluginRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): PluginRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_NOT_FOUND,
        message: `No existe ningún plugin registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  search(query: string): string[] {
    const needle = query.toLowerCase();
    return this.list().filter((id) => {
      const record = this.require(id);
      return (
        record.manifest.name.toLowerCase().includes(needle) ||
        record.manifest.description.toLowerCase().includes(needle) ||
        record.manifest.id.toLowerCase().includes(needle)
      );
    });
  }

  toDescriptor(id: string): PluginDescriptor {
    const record = this.require(id);
    return {
      manifest: record.manifest,
      metadata: record.metadata,
      configuration: record.configuration,
      grantedPermissions: record.grantedPermissions,
      state: record.state,
      ...(record.health ? { health: record.health } : {}),
    };
  }

  setState(id: string, next: PluginState): void {
    const record = this.require(id);
    if (!isPluginStateTransitionAllowed(record.state, next)) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setHealth(id: string, health: PluginHealth): void {
    this.require(id).health = health;
  }

  replaceManifest(id: string, manifest: PluginManifest): void {
    this.require(id).manifest = manifest;
  }

  replaceConfiguration(id: string, configuration: PluginConfiguration): void {
    this.require(id).configuration = configuration;
  }

  replaceGrantedPermissions(id: string, grantedPermissions: readonly PluginPermission[]): void {
    this.require(id).grantedPermissions = grantedPermissions;
  }

  replaceMetadata(id: string, metadata: PluginMetadata): void {
    this.require(id).metadata = metadata;
  }

  clear(): void {
    this.records.clear();
  }

  /** Ids de plugins activos que declaran una dependencia obligatoria (no opcional) sobre `id`. */
  getActiveDependents(id: string): string[] {
    return this.list().filter((otherId) => {
      const other = this.require(otherId);
      if (other.state !== "active") return false;
      return other.manifest.dependencies.some((dep) => dep.pluginId === id && !dep.optional);
    });
  }

  /**
   * Resuelve el orden de activación mediante ordenación topológica de las
   * dependencias obligatorias entre los `ids` indicados, desempatando por
   * prioridad descendente y, en último término, por id ascendente.
   */
  resolveActivationOrder(ids: readonly string[]): string[] {
    const idSet = new Set(ids);

    for (const id of ids) {
      for (const dep of this.require(id).manifest.dependencies) {
        if (!dep.optional && !idSet.has(dep.pluginId)) {
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
            message: `El plugin "${id}" depende de "${dep.pluginId}", que no está disponible.`,
            origin: "dependency",
            recoverable: true,
          });
        }
      }
    }

    const remaining = new Set(ids);
    const resolved: string[] = [];

    while (remaining.size > 0) {
      const ready = [...remaining].filter((id) =>
        this.require(id)
          .manifest.dependencies.filter((dep) => !dep.optional)
          .every((dep) => !remaining.has(dep.pluginId))
      );
      if (ready.length === 0) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_DEPENDENCY_CYCLE,
          message: `Se detectó un ciclo de dependencias entre plugins: ${[...remaining].sort().join(", ")}.`,
          origin: "dependency",
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
