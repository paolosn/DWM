import type { LifecycleState } from "../core/LifecycleState.js";
import type { NormalizedConfig } from "../config/types.js";
import type { ProfileDescriptor } from "../profile/types.js";
import type { ModuleDescriptor } from "../registry/ModuleRegistry.js";
import type { AdapterDescriptor } from "../registry/AdapterRegistry.js";
import type { StatusRecord } from "../status/SystemStatus.js";
import type { DWMError } from "../errors/DWMError.js";

/**
 * Catálogo cerrado de eventos emitidos por el propio Core (namespace `core:*`).
 * Módulos externos pueden emitir sus propios eventos de dominio a través del
 * mismo EventBus usando otros namespaces; el Core no restringe esos eventos,
 * solo garantiza la estabilidad de los suyos.
 */
export interface CoreEventPayloads {
  "core:lifecycle-changed": { from: LifecycleState; to: LifecycleState };
  "core:config-loaded": { config: NormalizedConfig };
  "core:profile-loaded": { profile: ProfileDescriptor | null };
  "core:registries-ready": Record<string, never>;
  "core:module-registered": { module: ModuleDescriptor };
  "core:module-unregistered": { moduleId: string };
  "core:adapter-registered": { adapter: AdapterDescriptor };
  "core:adapter-unregistered": { adapterId: string };
  "core:status-reported": { record: StatusRecord };
  "core:ready": Record<string, never>;
  "core:running": Record<string, never>;
  "core:shutting-down": Record<string, never>;
  "core:stopped": Record<string, never>;
  "core:error": { error: DWMError };
  "core:listener-error": { eventType: string; error: unknown };
}

export type CoreEventType = keyof CoreEventPayloads;
