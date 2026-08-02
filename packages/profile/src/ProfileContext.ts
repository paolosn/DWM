import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileConfiguration } from "./ProfileConfiguration.js";

/**
 * Contexto informativo asociado a un perfil: identifica el perfil, expone
 * su configuración vigente y las integraciones opcionales disponibles
 * (usado, por ejemplo, por un futuro Project Manager para asociar
 * proyectos al entorno completo que describe el perfil).
 */
export interface ProfileContext {
  readonly profileId: string;
  readonly configuration: ProfileConfiguration;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  getSecret(key: string): Promise<string | undefined>;
  getConfigSection<T>(namespace: string): Promise<T | undefined>;
}
