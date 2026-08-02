import type { ScopedEventBus } from "../events/EventBus.js";
import type { NormalizedConfig } from "../config/types.js";
import type { ProfileDescriptor } from "../profile/types.js";
import type { SystemStatus } from "../status/SystemStatus.js";

/**
 * Superficie mínima que el Core entrega a todo módulo o adaptador en su
 * `init()`. Es la única vía de acceso hacia la infraestructura del Core
 * (README §12): un módulo externo nunca recibe una referencia directa a
 * `DWMCore`, `ConfigManager`, `ModuleRegistry` ni `AdapterRegistry`.
 *
 * `eventBus` es un `ScopedEventBus`, no el `EventBus` interno completo: un
 * módulo puede suscribirse libremente a eventos `core:*` y a eventos de
 * dominio de otros módulos, pero solo puede **emitir** eventos fuera del
 * namespace `core:*` (README §12, regla I). Intentar emitir un evento
 * `core:*` lanza un `DWMError` (`RESERVED_EVENT_NAMESPACE`).
 */
export interface ModuleContext {
  eventBus: ScopedEventBus;
  getConfig(): NormalizedConfig;
  getActiveProfile(): ProfileDescriptor | null;
  reportStatus(status: SystemStatus, detail?: string): void;
}

/**
 * Contrato que debe implementar todo módulo del sistema (Tooling Manager, AI
 * Manager, Secrets Manager, etc.) para poder registrarse en el Core.
 *
 * Ninguna implementación concreta de estos módulos forma parte de esta fase;
 * este archivo define únicamente el contrato que deberán cumplir.
 */
export interface IModule {
  /** Identificador único y estable del módulo. */
  id: string;

  /** Versión propia del módulo (semver recomendado). */
  version: string;

  /**
   * Versión del contrato `IModule` que el módulo declara soportar
   * (ADR-001 §19). El Core rechaza el registro si es incompatible con la
   * versión de contrato que expone.
   */
  contractVersion: string;

  /** Inicialización del módulo; recibe el contexto mínimo del Core. */
  init(context: ModuleContext): Promise<void>;

  /** Liberación opcional de recursos al desregistrar el módulo. */
  dispose?(): Promise<void>;
}
