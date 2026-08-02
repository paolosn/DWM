import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import { ConfigStore } from "./ConfigStore.js";
import { assertValidNamespace } from "./namespace.js";
import { ConfigErrorCode } from "./errors/ConfigErrorCode.js";
import { createConfigError } from "./errors/ConfigError.js";

export interface ConfigManagerOptions {
  /** Directorio donde se persiste una sección por namespace (un fichero JSON cada una). */
  readonly configDir: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
}

/**
 * Módulo de configuración extensible por namespace del sistema DWM.
 * Implementa `IModule` (ADR-002 §3): se registra en el Core mediante
 * `registerModule`, recibe únicamente el `ModuleContext` mínimo, y no
 * contiene lógica de ninguna herramienta o sistema operativo.
 *
 * Formaliza el principio de ADR-002 §8: cada módulo gestiona su propia
 * sección de configuración, identificada por un namespace propio que no
 * colisiona con el de otro módulo ni con la configuración general que ya
 * gestiona el Core. Mantiene una caché en memoria para evitar relecturas
 * de disco innecesarias.
 */
export class ConfigManager implements IModule {
  readonly id = "config-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly store: ConfigStore;
  private readonly logger?: Logger;
  private readonly eventBus?: EventBus;
  private readonly cache = new Map<string, unknown>();

  constructor(options: ConfigManagerOptions) {
    if (!options || typeof options.configDir !== "string" || options.configDir.length === 0) {
      throw createConfigError({
        code: ConfigErrorCode.CONFIG_INVALID_CONFIGURATION,
        message: "ConfigManagerOptions.configDir es obligatorio y debe ser una cadena no vacía.",
        origin: "configuration",
        recoverable: false,
      });
    }
    this.store = new ConfigStore(options.configDir);
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
  }

  async getSection<T>(namespace: string): Promise<T | undefined> {
    assertValidNamespace(namespace);
    if (this.cache.has(namespace)) {
      return this.cache.get(namespace) as T;
    }
    const value = await this.store.read<T>(namespace);
    if (value !== undefined) this.cache.set(namespace, value);
    return value;
  }

  async getSectionOrDefault<T>(namespace: string, defaultValue: T): Promise<T> {
    const value = await this.getSection<T>(namespace);
    return value === undefined ? defaultValue : value;
  }

  async requireSection<T>(namespace: string): Promise<T> {
    const value = await this.getSection<T>(namespace);
    if (value === undefined) {
      throw createConfigError({
        code: ConfigErrorCode.CONFIG_SECTION_NOT_FOUND,
        message: `No existe ninguna sección de configuración con namespace "${namespace}".`,
        origin: "namespace",
        recoverable: true,
      });
    }
    return value;
  }

  async setSection<T>(namespace: string, value: T): Promise<void> {
    assertValidNamespace(namespace);
    await this.store.write(namespace, value);
    this.cache.set(namespace, value);
    await this.notify("section.updated", namespace);
  }

  async deleteSection(namespace: string): Promise<void> {
    assertValidNamespace(namespace);
    await this.store.delete(namespace);
    this.cache.delete(namespace);
    await this.notify("section.deleted", namespace);
  }

  async hasSection(namespace: string): Promise<boolean> {
    return (await this.getSection(namespace)) !== undefined;
  }

  async listNamespaces(): Promise<string[]> {
    const persisted = await this.store.listNamespaces();
    const cached = [...this.cache.keys()];
    return [...new Set([...persisted, ...cached])].sort();
  }

  async init(context: ModuleContext): Promise<void> {
    // Integración con la configuración normalizada del Core (ADR-002 §8.3),
    // consistente con el patrón ya usado por los demás módulos.
    context.getConfig();
    context.reportStatus(SystemStatus.OK, "config-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.cache.clear();
  }

  private async notify(
    phase: "section.updated" | "section.deleted",
    namespace: string
  ): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`config.${phase}`, { namespace }, { correlationId: namespace });
    }
    if (this.logger) {
      await this.logger.withCorrelationId(namespace).info(`config:${phase} ${namespace}`);
    }
  }
}
