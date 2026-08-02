import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { AIManager } from "@dwm/ai-manager";

/**
 * Contexto entregado a un `BaseAdapter` durante `onInit()`/`onActivate()`.
 * Cada servicio es opcional: solo está presente si `AdapterManager` fue
 * construido con la integración correspondiente. Ningún adaptador recibe
 * acceso directo a otro adaptador ni al `AdapterRegistry`.
 */
export interface AdapterContext {
  /** Logger ya correlacionado con el id del adaptador. */
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly aiManager?: AIManager;
  /** Resuelve un secreto mediante @dwm/secrets; `undefined` si no existe o no hay SecretsManager configurado. */
  getSecret(key: string): Promise<string | undefined>;
  /** Lee la sección de configuración propia del adaptador mediante @dwm/config. */
  getConfigSection<T>(namespace: string): Promise<T | undefined>;
}
