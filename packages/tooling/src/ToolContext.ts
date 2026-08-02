import type { Logger } from "@dwm/logger";
import type { EventBus } from "@dwm/event-bus";
import type { Scheduler } from "@dwm/scheduler";
import type { AIManager } from "@dwm/ai-manager";
import type { ToolCapabilities } from "./ToolCapabilities.js";
import type { ToolConfiguration } from "./ToolConfiguration.js";

/**
 * Contexto informativo asociado a una herramienta: identifica la
 * herramienta y su adaptador subyacente, expone sus capacidades y
 * configuración vigentes, el workspace activo (si hay `@dwm/workspace`
 * integrado) y las integraciones opcionales disponibles. No incluye
 * ganchos de ciclo de vida (esos ya los recibe el adaptador subyacente a
 * través de `AdapterContext`); es una vista de solo lectura para quien
 * consuma la herramienta.
 */
export interface ToolContext {
  readonly toolId: string;
  readonly adapterId: string;
  readonly capabilities: ToolCapabilities;
  readonly configuration: ToolConfiguration;
  readonly activeWorkspaceId?: string;
  readonly logger?: Logger;
  readonly eventBus?: EventBus;
  readonly scheduler?: Scheduler;
  readonly aiManager?: AIManager;
  getSecret(key: string): Promise<string | undefined>;
  getConfigSection<T>(namespace: string): Promise<T | undefined>;
}
