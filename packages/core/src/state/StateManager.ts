import { LifecycleState } from "../core/LifecycleState.js";
import { SystemStatus, type StatusRecord } from "../status/SystemStatus.js";
import type { ModuleDescriptor } from "../registry/ModuleRegistry.js";
import type { AdapterDescriptor } from "../registry/AdapterRegistry.js";

export interface SystemSnapshot {
  lifecycleState: LifecycleState;
  configStatus: SystemStatus;
  profileStatus: SystemStatus;
  modules: ModuleDescriptor[];
  adapters: AdapterDescriptor[];
  lastTransitionAt: string;
}

/**
 * Agregado en memoria de solo lectura hacia el exterior (README §10). No
 * persiste nada por sí mismo: se reconstruye en cada arranque a partir de la
 * configuración, el perfil y los registros. Es la fuente que un futuro
 * Status Manager consumirá para construir el Dashboard (FRS-001 §2), pero el
 * Core no construye ninguna interfaz.
 */
export class StateManager {
  private lifecycleState: LifecycleState = LifecycleState.UNINITIALIZED;
  private configStatus: SystemStatus = SystemStatus.UNCONFIGURED;
  private profileStatus: SystemStatus = SystemStatus.UNCONFIGURED;
  private lastTransitionAt: string = new Date().toISOString();
  private readonly externalStatuses: Map<string, StatusRecord> = new Map();

  setLifecycleState(state: LifecycleState): void {
    this.lifecycleState = state;
    this.lastTransitionAt = new Date().toISOString();
  }

  /**
   * Restablece el agregado a su estado inicial. Se invoca al reinicializar
   * el Core desde ERROR o STOPPED (README §12, regla H), garantizando que no
   * queden estados residuales de un ciclo de vida anterior.
   */
  reset(): void {
    this.configStatus = SystemStatus.UNCONFIGURED;
    this.profileStatus = SystemStatus.UNCONFIGURED;
    this.externalStatuses.clear();
  }

  setConfigStatus(status: SystemStatus): void {
    this.configStatus = status;
  }

  setProfileStatus(status: SystemStatus): void {
    this.profileStatus = status;
  }

  recordStatus(sourceId: string, status: SystemStatus, detail?: string): void {
    const record: StatusRecord = {
      sourceId,
      status,
      updatedAt: new Date().toISOString(),
    };
    if (detail !== undefined) {
      record.detail = detail;
    }
    this.externalStatuses.set(sourceId, record);
  }

  getSnapshot(modules: ModuleDescriptor[], adapters: AdapterDescriptor[]): SystemSnapshot {
    return {
      lifecycleState: this.lifecycleState,
      configStatus: this.configStatus,
      profileStatus: this.profileStatus,
      modules,
      adapters,
      lastTransitionAt: this.lastTransitionAt,
    };
  }
}
