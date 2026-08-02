import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectManager } from "@dwm/project";
import type { PluginConfiguration } from "./PluginConfiguration.js";

/**
 * Contexto restringido entregado a un plugin durante su ciclo de vida
 * (`onInstall`/`onLoad`/`onInit`/`onActivate`). Cada servicio solo está
 * presente si el permiso correspondiente fue explícitamente concedido (no
 * basta con haberlo solicitado en el manifiesto): un plugin nunca recibe
 * acceso irrestricto a todos los servicios de DWM. `getSecret()` nunca
 * expone el catálogo de secretos, solo resuelve una clave concreta.
 */
export interface PluginContext {
  readonly pluginId: string;
  readonly configuration: PluginConfiguration;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  readonly projectManager?: ProjectManager;
  /** Resuelve un secreto solo si se concedió `PluginPermission.SECRETS_READ`; en caso contrario, siempre `undefined`. */
  getSecret(key: string): Promise<string | undefined>;
  /** Lee una sección de configuración solo si se concedió `PluginPermission.CONFIG_READ`. */
  getConfigSection<T>(namespace: string): Promise<T | undefined>;
}
