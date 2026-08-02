import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { AIManager } from "@dwm/ai-manager";
import type { AdapterManager } from "@dwm/adapters";
import type { ToolingManager } from "@dwm/tooling";
import type { WorkspaceManager } from "@dwm/workspace";
import type { ProfileManager } from "@dwm/profile";
import type { ProjectConfiguration } from "./ProjectConfiguration.js";

/**
 * Contexto informativo asociado a un proyecto: identifica el proyecto,
 * expone su configuración vigente (incluido el perfil al que está
 * asociado) y las integraciones opcionales disponibles.
 */
export interface ProjectContext {
  readonly projectId: string;
  readonly configuration: ProjectConfiguration;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly aiManager?: AIManager;
  readonly adapterManager?: AdapterManager;
  readonly toolingManager?: ToolingManager;
  readonly workspaceManager?: WorkspaceManager;
  readonly profileManager?: ProfileManager;
  getSecret(key: string): Promise<string | undefined>;
  getConfigSection<T>(namespace: string): Promise<T | undefined>;
}
