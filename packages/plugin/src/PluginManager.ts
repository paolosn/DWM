import type { IModule, ModuleContext } from "@dwm/core";
import { SystemStatus } from "@dwm/core";
import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler, TaskHandle } from "@dwm/scheduler";
import type { ConfigManager } from "@dwm/config";
import type { SecretsManager } from "@dwm/secrets";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginManifest } from "./PluginManifest.js";
import type { PluginFactory } from "./PluginFactory.js";
import type { PluginSource } from "./PluginSource.js";
import type { Plugin } from "./Plugin.js";
import { PluginRegistry } from "./PluginRegistry.js";
import { PluginStore, type PersistedPlugin } from "./PluginStore.js";
import { PluginValidator, type PluginValidationResult } from "./PluginValidator.js";
import { PluginLoader } from "./PluginLoader.js";
import { PluginLifecycle } from "./PluginLifecycle.js";
import { checkPluginCompatibility, compareSemver } from "./PluginCompatibility.js";
import { createInitialPluginMetadata, touchPluginMetadata } from "./PluginMetadata.js";
import type { PluginConfiguration } from "./PluginConfiguration.js";
import { defaultPluginConfiguration, validatePluginConfiguration } from "./PluginConfiguration.js";
import { PluginPermission } from "./PluginPermissions.js";
import type { PluginContext } from "./PluginContext.js";
import type { PluginDescriptor } from "./PluginDescriptor.js";
import type { PluginHealth } from "./PluginHealth.js";
import { makePluginHealth } from "./PluginHealth.js";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { PluginError, createPluginError } from "./errors/PluginError.js";

export interface PluginManagerOptions {
  readonly pluginsDir: string;
  readonly dwmVersion: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  readonly healthCheckIntervalMs?: number;
}

export interface InstallPluginOptions {
  readonly grantedPermissions?: readonly PluginPermission[];
}

export interface UninstallPluginOptions {
  readonly keepConfiguration?: boolean;
}

export interface DeactivatePluginOptions {
  readonly cascade?: boolean;
}

export interface DiscoverPluginsResult {
  readonly discovered: readonly string[];
  readonly failed: ReadonlyArray<{ readonly id?: string; readonly error: PluginError }>;
}

type PluginEventPhase =
  | "discovered"
  | "registered"
  | "install.started"
  | "installed"
  | "load.started"
  | "loaded"
  | "initialized"
  | "activate.started"
  | "activated"
  | "deactivate.started"
  | "deactivated"
  | "unloaded"
  | "update.started"
  | "updated"
  | "uninstall.started"
  | "uninstalled"
  | "health.checked"
  | "error";

const HEALTH_CHECK_TASK_ID = "plugin-health-check";

/**
 * Infraestructura central de plugins del sistema DWM. Implementa `IModule`
 * (ADR-002 §3): se registra en el Core mediante `registerModule`, recibe
 * únicamente el `ModuleContext` mínimo, y no contiene lógica de ningún
 * plugin funcional concreto (WordPress, Laravel, Git, VSCode, OpenCode,
 * IA, backups...). Orquesta el ciclo de vida completo (descubrir → validar
 * → registrar → instalar → cargar → inicializar → activar ↔ desactivar →
 * descargar → desinstalar, con actualización y recarga) de instancias de
 * `Plugin`, nunca ejecuta código durante el descubrimiento/validación, y
 * limita el `PluginContext` estrictamente a los permisos concedidos.
 */
export class PluginManager implements IModule {
  readonly id = "plugin-manager";
  readonly version = "1.0.0";
  readonly contractVersion = "1.0.0";

  private readonly registry = new PluginRegistry();
  private readonly store: PluginStore;
  private readonly validator = new PluginValidator();
  private readonly loader = new PluginLoader();
  private readonly lifecycle = new PluginLifecycle();
  private readonly instances = new Map<string, Plugin>();
  private readonly busy = new Set<string>();
  private readonly dwmVersion: string;

  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly configManager?: ConfigManager;
  readonly secretsManager?: SecretsManager;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  private readonly healthCheckIntervalMs?: number;
  private healthCheckTaskHandle?: TaskHandle;

  constructor(options: PluginManagerOptions) {
    if (!options || typeof options.pluginsDir !== "string" || options.pluginsDir.length === 0) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
        message: "PluginManagerOptions.pluginsDir es obligatorio y debe ser una cadena no vacía.",
        origin: "configuration",
        recoverable: false,
      });
    }
    if (typeof options.dwmVersion !== "string" || options.dwmVersion.length === 0) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_INVALID_CONFIGURATION,
        message: "PluginManagerOptions.dwmVersion es obligatorio y debe ser una cadena no vacía.",
        origin: "configuration",
        recoverable: false,
      });
    }
    this.store = new PluginStore(options.pluginsDir);
    this.dwmVersion = options.dwmVersion;
    if (options.logger) this.logger = options.logger;
    if (options.eventBus) this.eventBus = options.eventBus;
    if (options.scheduler) this.scheduler = options.scheduler;
    if (options.configManager) this.configManager = options.configManager;
    if (options.secretsManager) this.secretsManager = options.secretsManager;
    if (options.aiManager) this.aiManager = options.aiManager;
    if (options.adapterManager) this.adapterManager = options.adapterManager;
    if (options.toolingManager) this.toolingManager = options.toolingManager;
    if (options.workspaceManager) this.workspaceManager = options.workspaceManager;
    if (options.profileManager) this.profileManager = options.profileManager;
    if (options.projectManager) this.projectManager = options.projectManager;
    if (options.healthCheckIntervalMs) this.healthCheckIntervalMs = options.healthCheckIntervalMs;
  }

  private isModuleAvailable(moduleId: string): boolean {
    switch (moduleId) {
      case "workspace":
        return this.workspaceManager !== undefined;
      case "ai-manager":
        return this.aiManager !== undefined;
      case "adapters":
        return this.adapterManager !== undefined;
      case "tooling":
        return this.toolingManager !== undefined;
      case "profile":
        return this.profileManager !== undefined;
      case "project":
        return this.projectManager !== undefined;
      case "secrets":
        return this.secretsManager !== undefined;
      case "config":
        return this.configManager !== undefined;
      case "scheduler":
        return this.scheduler !== undefined;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------
  // Descubrimiento, validación y registro
  // ---------------------------------------------------------------------

  async discoverPlugins(source: PluginSource): Promise<DiscoverPluginsResult> {
    const manifests = await source.discover();
    const discovered: string[] = [];
    const failed: Array<{ id?: string; error: PluginError }> = [];

    for (const manifest of manifests) {
      try {
        if (!manifest || typeof manifest.id !== "string" || manifest.id.length === 0) {
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_INVALID_MANIFEST,
            message: "El manifiesto descubierto no declara un id válido.",
            origin: "manifest",
            recoverable: true,
          });
        }
        if (this.registry.has(manifest.id)) {
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_ALREADY_REGISTERED,
            message: `Ya existe un plugin registrado con id "${manifest.id}".`,
            origin: "registry",
            recoverable: true,
          });
        }
        this.registry.register(
          manifest,
          createInitialPluginMetadata(manifest.id),
          defaultPluginConfiguration(manifest.defaultConfiguration),
          [],
          "discovered"
        );
        discovered.push(manifest.id);
        await this.notify("discovered", manifest.id);
      } catch (err) {
        failed.push({
          ...(manifest?.id ? { id: manifest.id } : {}),
          error: PluginError.wrap(err, {
            code: PluginErrorCode.PLUGIN_INVALID_MANIFEST,
            origin: "manifest",
            recoverable: true,
          }),
        });
      }
    }

    return { discovered, failed };
  }

  validatePlugin(id: string): PluginValidationResult {
    return this.validator.validateManifest(this.registry.require(id).manifest);
  }

  async registerPlugin(id: string): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      this.validator.assertValidManifest(record.manifest);
      this.registry.setState(id, "registered");
      await this.notify("registered", id);
    });
  }

  // ---------------------------------------------------------------------
  // Instalación
  // ---------------------------------------------------------------------

  async installPlugin(
    id: string,
    factory: PluginFactory,
    options: InstallPluginOptions = {}
  ): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      await this.notify("install.started", id);

      const compatibility = checkPluginCompatibility(record.manifest, this.dwmVersion);
      if (!compatibility.compatible) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_INCOMPATIBLE,
          message: `El plugin "${id}" no es compatible: ${compatibility.reason}`,
          origin: "compatibility",
          recoverable: true,
        });
      }

      for (const moduleId of record.manifest.moduleDependencies) {
        if (!this.isModuleAvailable(moduleId)) {
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
            message: `El plugin "${id}" requiere el módulo "${moduleId}", que no está disponible.`,
            origin: "dependency",
            recoverable: true,
          });
        }
      }

      for (const dependency of record.manifest.dependencies) {
        const dependencyRecord = this.registry.get(dependency.pluginId);
        if (!dependencyRecord) {
          if (dependency.optional) continue;
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
            message: `El plugin "${id}" depende de "${dependency.pluginId}", que no está registrado.`,
            origin: "dependency",
            recoverable: true,
          });
        }
        if (
          dependency.minVersion &&
          compareSemver(dependencyRecord.manifest.version, dependency.minVersion) < 0
        ) {
          throw createPluginError({
            code: PluginErrorCode.PLUGIN_VERSION_CONFLICT,
            message: `El plugin "${id}" requiere "${dependency.pluginId}" >= ${dependency.minVersion}, pero está en ${dependencyRecord.manifest.version}.`,
            origin: "dependency",
            recoverable: true,
          });
        }
      }

      const grantedPermissions = options.grantedPermissions ?? [];
      const instance = await this.loader.load(id, factory);
      const context = this.buildContext(record, grantedPermissions);
      await this.lifecycle.install(id, instance, context);

      this.instances.set(id, instance);
      this.registry.replaceGrantedPermissions(id, grantedPermissions);
      this.registry.setState(id, "installed");
      await this.store.write(this.toPersisted(id));
      await this.notify("installed", id);
    });
  }

  // ---------------------------------------------------------------------
  // Carga, inicialización, activación
  // ---------------------------------------------------------------------

  async loadPlugin(id: string): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      const instance = this.requireInstance(id);
      await this.notify("load.started", id);
      await this.lifecycle.load(id, instance, this.buildContext(record, record.grantedPermissions));
      this.registry.setState(id, "loaded");
      await this.store.write(this.toPersisted(id));
      await this.notify("loaded", id);
    });
  }

  async initializePlugin(id: string): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      const instance = this.requireInstance(id);
      await this.lifecycle.initialize(
        id,
        instance,
        this.buildContext(record, record.grantedPermissions)
      );
      this.registry.setState(id, "initialized");
      await this.store.write(this.toPersisted(id));
      await this.notify("initialized", id);
    });
  }

  async activatePlugin(id: string): Promise<void> {
    return this.withLock(id, async () => {
      await this.activateInternal(id);
    });
  }

  private async activateInternal(id: string): Promise<void> {
    const record = this.registry.require(id);
    await this.notify("activate.started", id);

    const compatibility = checkPluginCompatibility(record.manifest, this.dwmVersion);
    if (!compatibility.compatible) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_INCOMPATIBLE,
        message: `El plugin "${id}" no es compatible: ${compatibility.reason}`,
        origin: "compatibility",
        recoverable: true,
      });
    }

    for (const dependency of record.manifest.dependencies) {
      if (dependency.optional) continue;
      const dependencyRecord = this.registry.get(dependency.pluginId);
      if (!dependencyRecord || dependencyRecord.state !== "active") {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_MISSING_DEPENDENCY,
          message: `El plugin "${id}" requiere que "${dependency.pluginId}" esté activo.`,
          origin: "dependency",
          recoverable: true,
        });
      }
    }

    const grantedSet = new Set(record.grantedPermissions);
    for (const request of record.manifest.permissions) {
      if (request.required && !grantedSet.has(request.permission)) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_PERMISSION_DENIED,
          message: `El plugin "${id}" requiere el permiso obligatorio "${request.permission}", que no ha sido concedido.`,
          origin: "permission",
          recoverable: true,
        });
      }
    }

    const instance = this.requireInstance(id);
    await this.lifecycle.activate(
      id,
      instance,
      this.buildContext(record, record.grantedPermissions)
    );
    this.registry.setState(id, "active");
    await this.store.write(this.toPersisted(id));
    await this.notify("activated", id);
  }

  // ---------------------------------------------------------------------
  // Desactivación, descarga, desinstalación
  // ---------------------------------------------------------------------

  async deactivatePlugin(id: string, options: DeactivatePluginOptions = {}): Promise<void> {
    return this.withLock(id, async () => {
      await this.deactivateInternal(id, options);
    });
  }

  private async deactivateInternal(id: string, options: DeactivatePluginOptions): Promise<void> {
    const record = this.registry.require(id);
    if (record.state === "inactive") return;

    const dependents = this.registry.getActiveDependents(id);
    if (dependents.length > 0) {
      if (!options.cascade) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_HAS_ACTIVE_DEPENDENTS,
          message: `El plugin "${id}" tiene dependientes activos: ${dependents.join(", ")}.`,
          origin: "dependency",
          recoverable: true,
        });
      }
      for (const dependentId of dependents) {
        await this.deactivateInternal(dependentId, options);
      }
    }

    await this.notify("deactivate.started", id);
    const instance = this.requireInstance(id);
    await this.lifecycle.deactivate(id, instance);
    this.registry.setState(id, "inactive");
    await this.store.write(this.toPersisted(id));
    await this.notify("deactivated", id);
  }

  async unloadPlugin(id: string): Promise<void> {
    return this.withLock(id, async () => {
      const instance = this.requireInstance(id);
      await this.lifecycle.unload(id, instance);
      this.instances.delete(id);
      this.registry.setState(id, "installed");
      await this.store.write(this.toPersisted(id));
      await this.notify("unloaded", id);
    });
  }

  async uninstallPlugin(id: string, options: UninstallPluginOptions = {}): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      const dependents = this.registry.getActiveDependents(id);
      if (dependents.length > 0) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_HAS_ACTIVE_DEPENDENTS,
          message: `No se puede desinstalar "${id}": tiene dependientes activos: ${dependents.join(", ")}.`,
          origin: "dependency",
          recoverable: true,
        });
      }

      await this.notify("uninstall.started", id);

      if (record.state === "active") {
        await this.deactivateInternal(id, {});
      }
      const instance = this.instances.get(id);
      if (instance) {
        await this.lifecycle.uninstall(id, instance);
      }

      if (!options.keepConfiguration) {
        await this.store.delete(id);
      }
      this.registry.setState(id, "uninstalled");
      this.registry.unregister(id);
      this.instances.delete(id);
      await this.notify("uninstalled", id);
    });
  }

  async reloadPlugin(id: string, factory: PluginFactory): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      const wasActive = record.state === "active";

      if (record.state === "active") {
        await this.deactivateInternal(id, {});
      }
      if (this.instances.has(id)) {
        const oldInstance = this.requireInstance(id);
        await this.lifecycle.unload(id, oldInstance);
        this.instances.delete(id);
        this.registry.setState(id, "installed");
      }

      const instance = await this.loader.load(id, factory);
      const context = this.buildContext(record, record.grantedPermissions);
      await this.lifecycle.load(id, instance, context);
      this.instances.set(id, instance);
      this.registry.setState(id, "loaded");
      await this.notify("loaded", id);

      await this.lifecycle.initialize(id, instance, context);
      this.registry.setState(id, "initialized");
      await this.notify("initialized", id);

      if (wasActive) {
        await this.activateInternal(id);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Actualización
  // ---------------------------------------------------------------------

  async updatePlugin(
    id: string,
    newManifest: PluginManifest,
    factory: PluginFactory,
    options: InstallPluginOptions = {}
  ): Promise<void> {
    return this.withLock(id, async () => {
      const record = this.registry.require(id);
      const wasActive = record.state === "active";

      this.validator.assertValidManifest(newManifest);
      const compatibility = checkPluginCompatibility(newManifest, this.dwmVersion);
      if (!compatibility.compatible) {
        throw createPluginError({
          code: PluginErrorCode.PLUGIN_INCOMPATIBLE,
          message: `La nueva versión de "${id}" no es compatible: ${compatibility.reason}`,
          origin: "compatibility",
          recoverable: true,
        });
      }

      await this.notify("update.started", id);
      this.registry.setState(id, "updating");

      try {
        if (wasActive) {
          const activeInstance = this.requireInstance(id);
          await this.lifecycle.deactivate(id, activeInstance).catch(() => {});
        }
        if (this.instances.has(id)) {
          const oldInstance = this.requireInstance(id);
          await this.lifecycle.unload(id, oldInstance).catch(() => {});
          this.instances.delete(id);
        }

        const grantedPermissions = options.grantedPermissions ?? record.grantedPermissions;
        const nextConfiguration = defaultPluginConfiguration({
          ...newManifest.defaultConfiguration,
          ...record.configuration.settings,
        });
        this.registry.replaceManifest(id, newManifest);
        this.registry.replaceConfiguration(id, nextConfiguration);
        this.registry.replaceGrantedPermissions(id, grantedPermissions);
        this.registry.replaceMetadata(id, touchPluginMetadata(record.metadata));

        const instance = await this.loader.load(id, factory);
        const context = this.buildContext(record, grantedPermissions);
        await this.lifecycle.load(id, instance, context);
        await this.lifecycle.initialize(id, instance, context);
        this.instances.set(id, instance);

        await this.store.write(this.toPersisted(id, "initialized"));
        this.registry.setState(id, "initialized");

        if (wasActive) {
          await this.activateInternal(id);
        }
        await this.notify("updated", id);
      } catch (err) {
        this.registry.setState(id, "failed");
        await this.notify("error", id);
        throw PluginError.wrap(err, {
          code: PluginErrorCode.PLUGIN_UPDATE_FAILED,
          origin: "lifecycle",
          recoverable: true,
          message: `Fallo al actualizar el plugin "${id}".`,
        });
      }
    });
  }

  // ---------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------

  async updatePluginConfiguration(
    id: string,
    settings: Readonly<Record<string, unknown>>
  ): Promise<void> {
    const record = this.registry.require(id);
    const next: PluginConfiguration = { ...record.configuration, settings: { ...settings } };
    validatePluginConfiguration(next);
    this.registry.replaceConfiguration(id, next);
    await this.store.write(this.toPersisted(id));
  }

  async resetPluginConfiguration(id: string): Promise<void> {
    const record = this.registry.require(id);
    const next = defaultPluginConfiguration(record.manifest.defaultConfiguration);
    this.registry.replaceConfiguration(id, next);
    await this.store.write(this.toPersisted(id));
  }

  // ---------------------------------------------------------------------
  // Consulta y salud
  // ---------------------------------------------------------------------

  getPlugin(id: string): PluginDescriptor | undefined {
    return this.registry.has(id) ? this.registry.toDescriptor(id) : undefined;
  }

  listPlugins(): string[] {
    return this.registry.list();
  }

  searchPlugins(query: string): string[] {
    return this.registry.search(query);
  }

  hasPlugin(id: string): boolean {
    return this.registry.has(id);
  }

  async checkHealth(id: string): Promise<PluginHealth> {
    const instance = this.instances.get(id);
    if (!instance) {
      const health = makePluginHealth(id, "unavailable", "El plugin no está cargado.");
      this.registry.setHealth(id, health);
      await this.notify("health.checked", id);
      return health;
    }
    try {
      const healthy = await this.lifecycle.checkHealth(instance);
      const health = makePluginHealth(id, healthy ? "healthy" : "failed");
      this.registry.setHealth(id, health);
      await this.notify("health.checked", id);
      return health;
    } catch (err) {
      const wrapped = PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_HEALTH_CHECK_FAILED,
        origin: "health-check",
        recoverable: true,
        message: `Fallo en el health check del plugin "${id}".`,
      });
      const health = makePluginHealth(id, "failed", wrapped.message);
      this.registry.setHealth(id, health);
      await this.notify("health.checked", id);
      return health;
    }
  }

  async checkAllHealth(): Promise<PluginHealth[]> {
    const results: PluginHealth[] = [];
    for (const id of this.registry.list()) {
      results.push(await this.checkHealth(id));
    }
    return results;
  }

  async loadFromPersistence(): Promise<string[]> {
    const ids = await this.store.listIds();
    const restored: string[] = [];
    for (const id of ids) {
      if (this.registry.has(id)) continue;
      const persisted = await this.store.read(id);
      if (!persisted) continue;
      this.registry.register(
        persisted.manifest,
        persisted.metadata,
        persisted.configuration,
        persisted.grantedPermissions,
        persisted.state === "active" ? "inactive" : persisted.state
      );
      if (persisted.health) this.registry.setHealth(id, persisted.health);
      restored.push(id);
    }
    return restored;
  }

  // ---------------------------------------------------------------------
  // IModule
  // ---------------------------------------------------------------------

  async init(context: ModuleContext): Promise<void> {
    context.getConfig();

    if (this.configManager) {
      await this.configManager.setSection("plugin-manager", { plugins: this.registry.list() });
    }

    if (this.scheduler && this.healthCheckIntervalMs) {
      this.healthCheckTaskHandle = this.scheduler.schedule(
        () => this.checkAllHealth().then(() => undefined),
        {
          id: HEALTH_CHECK_TASK_ID,
          intervalMs: this.healthCheckIntervalMs,
        }
      );
    }

    context.reportStatus(SystemStatus.OK, "plugin-manager inicializado");
  }

  async dispose(): Promise<void> {
    this.healthCheckTaskHandle?.cancel();
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private requireInstance(id: string): Plugin {
    const instance = this.instances.get(id);
    if (!instance) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_LOAD_FAILED,
        message: `El plugin "${id}" no tiene ninguna instancia cargada.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    return instance;
  }

  private toPersisted(id: string, stateOverride?: PersistedPlugin["state"]): PersistedPlugin {
    const record = this.registry.require(id);
    return {
      manifest: record.manifest,
      metadata: record.metadata,
      configuration: record.configuration,
      grantedPermissions: record.grantedPermissions,
      state: stateOverride ?? record.state,
      ...(record.health ? { health: record.health } : {}),
    };
  }

  private buildContext(
    record: { manifest: PluginManifest; configuration: PluginConfiguration },
    grantedPermissions: readonly PluginPermission[]
  ): PluginContext {
    const granted = new Set(grantedPermissions);
    const id = record.manifest.id;
    return {
      pluginId: id,
      configuration: record.configuration,
      ...(this.logger ? { logger: this.logger.withCorrelationId(id) } : {}),
      ...((granted.has(PluginPermission.EVENTS_EMIT) ||
        granted.has(PluginPermission.EVENTS_LISTEN)) &&
      this.eventBus
        ? { eventBus: this.eventBus }
        : {}),
      ...(granted.has(PluginPermission.SCHEDULER_USE) && this.scheduler
        ? { scheduler: this.scheduler }
        : {}),
      ...(granted.has(PluginPermission.AI_USE) && this.aiManager
        ? { aiManager: this.aiManager }
        : {}),
      ...(granted.has(PluginPermission.ADAPTERS_USE) && this.adapterManager
        ? { adapterManager: this.adapterManager }
        : {}),
      ...(granted.has(PluginPermission.TOOLS_USE) && this.toolingManager
        ? { toolingManager: this.toolingManager }
        : {}),
      ...(granted.has(PluginPermission.WORKSPACE_ACCESS) && this.workspaceManager
        ? { workspaceManager: this.workspaceManager }
        : {}),
      ...(granted.has(PluginPermission.PROJECT_ACCESS) && this.projectManager
        ? { projectManager: this.projectManager }
        : {}),
      ...(granted.has(PluginPermission.PROJECT_ACCESS) && this.profileManager
        ? { profileManager: this.profileManager }
        : {}),
      getSecret: async (key: string) =>
        granted.has(PluginPermission.SECRETS_READ) && this.secretsManager
          ? this.secretsManager.getSecret(key)
          : undefined,
      getConfigSection: async <T>(namespace: string) =>
        granted.has(PluginPermission.CONFIG_READ) && this.configManager
          ? this.configManager.getSection<T>(namespace)
          : undefined,
    };
  }

  private async notify(phase: PluginEventPhase, pluginId: string): Promise<void> {
    if (this.eventBus) {
      await this.eventBus.publish(`plugin.${phase}`, { pluginId }, { correlationId: pluginId });
    }
    if (this.logger) {
      const logger = this.logger.withCorrelationId(pluginId);
      if (phase === "error") {
        await logger.error(`plugin:${phase} ${pluginId}`);
      } else {
        await logger.info(`plugin:${phase} ${pluginId}`);
      }
    }
  }

  private async withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.busy.has(id)) {
      throw createPluginError({
        code: PluginErrorCode.PLUGIN_OPERATION_IN_PROGRESS,
        message: `Ya hay una operación en curso para el plugin "${id}".`,
        origin: "concurrency",
        recoverable: true,
      });
    }
    this.busy.add(id);
    try {
      return await fn();
    } finally {
      this.busy.delete(id);
    }
  }
}
