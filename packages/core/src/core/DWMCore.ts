import { LifecycleState, isTransitionAllowed } from "./LifecycleState.js";
import type { ShutdownFailure, ShutdownReport } from "./ShutdownReport.js";
import { EventBus } from "../events/EventBus.js";
import type { CoreEventType, CoreEventPayloads } from "../events/EventTypes.js";
import type { EventHandler, UnsubscribeFn } from "../events/EventBus.js";
import { DWMError } from "../errors/DWMError.js";
import { ErrorCode } from "../errors/ErrorCodes.js";
import { SystemStatus } from "../status/SystemStatus.js";
import type { StorageProvider } from "../config/StorageProvider.js";
import { ConfigManager } from "../config/ConfigManager.js";
import type { NormalizedConfig } from "../config/types.js";
import { ProfileLoader } from "../profile/ProfileLoader.js";
import type { ProfileDescriptor } from "../profile/types.js";
import { ModuleRegistry, type ModuleDescriptor } from "../registry/ModuleRegistry.js";
import { AdapterRegistry, type AdapterDescriptor } from "../registry/AdapterRegistry.js";
import type { IModule, ModuleContext } from "../contracts/IModule.js";
import type { IAdapter } from "../contracts/IAdapter.js";
import { StateManager, type SystemSnapshot } from "../state/StateManager.js";
import { deepFreezeClone } from "../state/immutable.js";

export interface BootstrapOptions {
  /** Proveedor de almacenamiento inyectado (README §2 / §9). */
  storage: StorageProvider;
}

/**
 * Conjuntos de estados del ciclo de vida en los que cada operación pública
 * está permitida (README §12, regla G). Cualquier invocación fuera de estos
 * conjuntos lanza `DWMError` con código `NOT_READY`.
 *
 * | Operación                          | Estados permitidos                              |
 * |-------------------------------------|--------------------------------------------------|
 * | `getLifecycleState`, `getSnapshot`   | cualquiera (diagnóstico siempre disponible)      |
 * | `getConfig`, `getActiveProfile`      | READY, RUNNING, SHUTTING_DOWN, STOPPED           |
 * | `getModule`, `listModules`,          | READY, RUNNING, SHUTTING_DOWN, STOPPED           |
 * | `getAdapter`, `getAdapterFor`,       |                                                    |
 * | `listAdapters`                      |                                                    |
 * | `registerModule`, `registerAdapter`  | READY, RUNNING                                   |
 * | `unregisterModule`,`unregisterAdapter`| READY, RUNNING, SHUTTING_DOWN                    |
 * | `reportStatus`                       | READY, RUNNING, SHUTTING_DOWN                    |
 * | `markRunning`                        | READY                                            |
 * | `shutdown`                           | READY, RUNNING                                   |
 * | `initialize`                         | UNINITIALIZED, ERROR, STOPPED (ver regla H)      |
 */
const READ_STATES = new Set([
  LifecycleState.READY,
  LifecycleState.RUNNING,
  LifecycleState.SHUTTING_DOWN,
  LifecycleState.STOPPED,
]);
const WRITE_STATES = new Set([LifecycleState.READY, LifecycleState.RUNNING]);
const UNREGISTER_STATES = new Set([
  LifecycleState.READY,
  LifecycleState.RUNNING,
  LifecycleState.SHUTTING_DOWN,
]);
const REPORT_STATUS_STATES = UNREGISTER_STATES;
const MARK_RUNNING_STATES = new Set([LifecycleState.READY]);
const SHUTDOWN_STATES = new Set([LifecycleState.READY, LifecycleState.RUNNING]);
const INITIALIZE_ALLOWED_FROM = new Set([
  LifecycleState.UNINITIALIZED,
  LifecycleState.ERROR,
  LifecycleState.STOPPED,
]);
const INITIALIZE_IN_PROGRESS_STATES = new Set([
  LifecycleState.BOOTSTRAPPING,
  LifecycleState.LOADING_CONFIG,
  LifecycleState.LOADING_PROFILE,
  LifecycleState.LOADING_REGISTRIES,
]);
const INITIALIZE_ALREADY_DONE_STATES = new Set([
  LifecycleState.READY,
  LifecycleState.RUNNING,
  LifecycleState.SHUTTING_DOWN,
]);

/**
 * Fachada y orquestador principal del Core (README §2). No contiene lógica
 * de negocio de ningún módulo externo; únicamente coordina la carga de
 * configuración, perfil y registros, y expone la API pública estable que
 * consumirán los demás módulos del sistema.
 */
export class DWMCore {
  private lifecycleState: LifecycleState = LifecycleState.UNINITIALIZED;

  private readonly eventBus = new EventBus();
  private readonly stateManager = new StateManager();

  private configManager: ConfigManager | null = null;
  private profileLoader: ProfileLoader | null = null;
  private activeProfile: ProfileDescriptor | null = null;

  private moduleRegistry: ModuleRegistry;
  private adapterRegistry: AdapterRegistry;

  constructor() {
    this.moduleRegistry = this.createModuleRegistry();
    this.adapterRegistry = this.createAdapterRegistry();
  }

  // ---------------------------------------------------------------------
  // Ciclo de vida
  // ---------------------------------------------------------------------

  /**
   * Ejecuta el flujo de inicialización completo (README §5).
   *
   * Política de reinicialización (README §12, regla H):
   * - Se rechaza con `ALREADY_INITIALIZED` si el Core ya está inicializado
   *   y en marcha (`READY`, `RUNNING` o `SHUTTING_DOWN`).
   * - Se rechaza con `INITIALIZATION_IN_PROGRESS` si hay una inicialización
   *   en curso (`BOOTSTRAPPING`..`LOADING_REGISTRIES`).
   * - Se permite explícitamente desde `UNINITIALIZED` (arranque normal),
   *   `ERROR` (reintento tras un fallo) y `STOPPED` (reinicio tras un
   *   apagado ordenado). En ambos casos de reintento, los registros de
   *   módulos/adaptadores y el estado agregado se recrean completamente
   *   limpios: no hay reinicialización implícita ni estado residual de un
   *   ciclo de vida anterior.
   */
  async initialize(options: BootstrapOptions): Promise<void> {
    if (INITIALIZE_IN_PROGRESS_STATES.has(this.lifecycleState)) {
      throw new DWMError({
        code: ErrorCode.INITIALIZATION_IN_PROGRESS,
        message: `No se puede inicializar: ya hay una inicialización en curso (estado actual: ${this.lifecycleState}).`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    if (INITIALIZE_ALREADY_DONE_STATES.has(this.lifecycleState)) {
      throw new DWMError({
        code: ErrorCode.ALREADY_INITIALIZED,
        message: `No se puede inicializar: el Core ya está inicializado (estado actual: ${this.lifecycleState}). Invoca shutdown() antes de reinicializar.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    if (!INITIALIZE_ALLOWED_FROM.has(this.lifecycleState)) {
      // Guarda defensiva; con los dos chequeos anteriores no debería alcanzarse.
      throw new DWMError({
        code: ErrorCode.INVALID_LIFECYCLE_TRANSITION,
        message: `initialize() no está permitido desde el estado actual: ${this.lifecycleState}.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }

    if (!options || !options.storage) {
      throw new DWMError({
        code: ErrorCode.INVALID_BOOTSTRAP_OPTIONS,
        message: "Se requiere un StorageProvider válido para inicializar el Core.",
        origin: "bootstrap",
        recoverable: false,
      });
    }

    // Reinicialización explícita (desde ERROR o STOPPED): se recrean los
    // registros y el agregado de estado para partir de un estado limpio.
    if (
      this.lifecycleState === LifecycleState.ERROR ||
      this.lifecycleState === LifecycleState.STOPPED
    ) {
      this.moduleRegistry = this.createModuleRegistry();
      this.adapterRegistry = this.createAdapterRegistry();
      this.stateManager.reset();
      this.configManager = null;
      this.profileLoader = null;
      this.activeProfile = null;
    }

    this.transitionTo(LifecycleState.BOOTSTRAPPING);

    try {
      this.transitionTo(LifecycleState.LOADING_CONFIG);
      this.configManager = new ConfigManager(options.storage);
      const config = await this.configManager.load();
      this.stateManager.setConfigStatus(SystemStatus.OK);
      this.eventBus.emit("core:config-loaded", { config });

      this.transitionTo(LifecycleState.LOADING_PROFILE);
      this.profileLoader = new ProfileLoader(options.storage);
      this.activeProfile = await this.profileLoader.loadActiveProfile(config);
      this.stateManager.setProfileStatus(
        this.activeProfile ? SystemStatus.OK : SystemStatus.PENDING
      );
      this.eventBus.emit("core:profile-loaded", { profile: this.activeProfile });

      this.transitionTo(LifecycleState.LOADING_REGISTRIES);
      // Los registros ya se instanciaron arriba; en este paso quedan
      // formalmente "listos" para recibir registros externos.
      this.eventBus.emit("core:registries-ready", {});

      this.transitionTo(LifecycleState.READY);
      this.eventBus.emit("core:ready", {});
    } catch (err) {
      const wrapped = DWMError.wrap(err, {
        code: ErrorCode.CONFIG_LOAD_FAILED,
        origin: "bootstrap",
        recoverable: false,
      });
      this.transitionTo(LifecycleState.ERROR);
      this.eventBus.emit("core:error", { error: wrapped });
      throw wrapped;
    }
  }

  /** Confirma que la aplicación host está sirviendo al usuario (README §4). */
  markRunning(): void {
    this.assertState(MARK_RUNNING_STATES, "markRunning");
    this.transitionTo(LifecycleState.RUNNING);
    this.eventBus.emit("core:running", {});
  }

  /**
   * Apagado ordenado (README §12, regla F).
   *
   * Se intenta dar de baja todos los módulos y adaptadores registrados,
   * incluso si alguno falla: ningún fallo se descarta en silencio, cada uno
   * se emite mediante `core:error` y además se agrega en el `ShutdownReport`
   * devuelto, para que quien invoque `shutdown()` pueda inspeccionar
   * exactamente qué falló. El Core siempre completa la transición a
   * `STOPPED`, independientemente de los fallos individuales.
   */
  async shutdown(): Promise<ShutdownReport> {
    this.assertState(SHUTDOWN_STATES, "shutdown");
    this.transitionTo(LifecycleState.SHUTTING_DOWN);
    this.eventBus.emit("core:shutting-down", {});

    const failures: ShutdownFailure[] = [];

    for (const descriptor of this.moduleRegistry.list()) {
      try {
        await this.moduleRegistry.unregister(descriptor.id);
      } catch (err) {
        const wrapped = DWMError.wrap(err, {
          code: ErrorCode.MODULE_DISPOSE_FAILED,
          origin: "registry-module",
          recoverable: true,
        });
        failures.push({ kind: "module", id: descriptor.id, error: wrapped });
        this.eventBus.emit("core:error", { error: wrapped });
      }
    }

    for (const descriptor of this.adapterRegistry.list()) {
      try {
        await this.adapterRegistry.unregister(descriptor.id);
      } catch (err) {
        const wrapped = DWMError.wrap(err, {
          code: ErrorCode.ADAPTER_DISPOSE_FAILED,
          origin: "registry-adapter",
          recoverable: true,
        });
        failures.push({ kind: "adapter", id: descriptor.id, error: wrapped });
        this.eventBus.emit("core:error", { error: wrapped });
      }
    }

    this.transitionTo(LifecycleState.STOPPED);
    this.eventBus.emit("core:stopped", {});

    return { failures };
  }

  getLifecycleState(): LifecycleState {
    return this.lifecycleState;
  }

  // ---------------------------------------------------------------------
  // Configuración y perfil
  // ---------------------------------------------------------------------

  getConfig(): NormalizedConfig {
    this.assertState(READ_STATES, "getConfig");
    return deepFreezeClone(this.configManager!.get());
  }

  getActiveProfile(): ProfileDescriptor | null {
    this.assertState(READ_STATES, "getActiveProfile");
    return this.activeProfile ? deepFreezeClone(this.activeProfile) : null;
  }

  // ---------------------------------------------------------------------
  // Registro de módulos
  // ---------------------------------------------------------------------

  async registerModule(module: IModule): Promise<void> {
    this.assertState(WRITE_STATES, "registerModule");
    await this.moduleRegistry.register(module);
    this.eventBus.emit("core:module-registered", {
      module: this.moduleRegistry.list().find((m) => m.id === module.id)!,
    });
  }

  async unregisterModule(moduleId: string): Promise<void> {
    this.assertState(UNREGISTER_STATES, "unregisterModule");
    await this.moduleRegistry.unregister(moduleId);
    this.eventBus.emit("core:module-unregistered", { moduleId });
  }

  getModule(moduleId: string): IModule | undefined {
    this.assertState(READ_STATES, "getModule");
    return this.moduleRegistry.get(moduleId);
  }

  listModules(): ModuleDescriptor[] {
    this.assertState(READ_STATES, "listModules");
    return deepFreezeClone(this.moduleRegistry.list());
  }

  // ---------------------------------------------------------------------
  // Registro de adaptadores
  // ---------------------------------------------------------------------

  async registerAdapter(adapter: IAdapter): Promise<void> {
    this.assertState(WRITE_STATES, "registerAdapter");
    await this.adapterRegistry.register(adapter);
    this.eventBus.emit("core:adapter-registered", {
      adapter: this.adapterRegistry.list().find((a) => a.id === adapter.id)!,
    });
  }

  async unregisterAdapter(adapterId: string): Promise<void> {
    this.assertState(UNREGISTER_STATES, "unregisterAdapter");
    await this.adapterRegistry.unregister(adapterId);
    this.eventBus.emit("core:adapter-unregistered", { adapterId });
  }

  getAdapter(adapterId: string): IAdapter | undefined {
    this.assertState(READ_STATES, "getAdapter");
    return this.adapterRegistry.get(adapterId);
  }

  getAdapterFor(subjectId: string): IAdapter | undefined {
    this.assertState(READ_STATES, "getAdapterFor");
    return this.adapterRegistry.getFor(subjectId);
  }

  listAdapters(): AdapterDescriptor[] {
    this.assertState(READ_STATES, "listAdapters");
    return deepFreezeClone(this.adapterRegistry.list());
  }

  // ---------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------

  reportStatus(sourceId: string, status: SystemStatus, detail?: string): void {
    this.assertState(REPORT_STATUS_STATES, "reportStatus");
    this.recordStatus(sourceId, status, detail);
  }

  /**
   * Snapshot agregado de estado (README §10). Disponible en cualquier estado
   * del ciclo de vida, incluido `ERROR`: es la principal herramienta de
   * diagnóstico tras un fallo, por lo que restringirlo sería contraproducente.
   */
  getSnapshot(): SystemSnapshot {
    return deepFreezeClone(
      this.stateManager.getSnapshot(this.moduleRegistry.list(), this.adapterRegistry.list())
    );
  }

  // ---------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------

  on<K extends CoreEventType>(
    eventType: K,
    handler: EventHandler<CoreEventPayloads[K]>
  ): UnsubscribeFn {
    return this.eventBus.on(eventType, handler);
  }

  off<K extends CoreEventType>(eventType: K, handler: EventHandler<CoreEventPayloads[K]>): void {
    this.eventBus.off(eventType, handler);
  }

  once<K extends CoreEventType>(eventType: K, handler: EventHandler<CoreEventPayloads[K]>): void {
    this.eventBus.once(eventType, handler);
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private createModuleRegistry(): ModuleRegistry {
    return new ModuleRegistry(
      (reportStatus) => this.buildModuleContext(reportStatus),
      (sourceId, status, detail) => this.recordStatus(sourceId, status, detail)
    );
  }

  private createAdapterRegistry(): AdapterRegistry {
    return new AdapterRegistry(
      (reportStatus) => this.buildModuleContext(reportStatus),
      (sourceId, status, detail) => this.recordStatus(sourceId, status, detail)
    );
  }

  private transitionTo(next: LifecycleState): void {
    if (!isTransitionAllowed(this.lifecycleState, next)) {
      throw new DWMError({
        code: ErrorCode.INVALID_LIFECYCLE_TRANSITION,
        message: `Transición de ciclo de vida no permitida: ${this.lifecycleState} → ${next}.`,
        origin: "lifecycle",
        recoverable: false,
      });
    }
    const from = this.lifecycleState;
    this.lifecycleState = next;
    this.stateManager.setLifecycleState(next);
    this.eventBus.emit("core:lifecycle-changed", { from, to: next });
  }

  private assertState(validStates: ReadonlySet<LifecycleState>, operation: string): void {
    if (!validStates.has(this.lifecycleState)) {
      throw new DWMError({
        code: ErrorCode.NOT_READY,
        message: `Operación "${operation}" no disponible en el estado actual del ciclo de vida: ${this.lifecycleState}.`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
  }

  private recordStatus(sourceId: string, status: SystemStatus, detail?: string): void {
    this.stateManager.recordStatus(sourceId, status, detail);
    const payload: CoreEventPayloads["core:status-reported"] = {
      record: {
        sourceId,
        status,
        updatedAt: new Date().toISOString(),
        ...(detail !== undefined ? { detail } : {}),
      },
    };
    this.eventBus.emit("core:status-reported", payload);
  }

  private buildModuleContext(
    reportStatus: (status: SystemStatus, detail?: string) => void
  ): ModuleContext {
    return {
      eventBus: this.eventBus.createScopedEmitter(),
      getConfig: () => this.getConfig(),
      getActiveProfile: () => this.getActiveProfile(),
      reportStatus,
    };
  }
}
