import type { ResolvedAiConfig } from "@dwm/project-provisioning";
import type { ApplicationContext } from "./ApplicationContext.js";

export type ResolvedAiOrigin = "project" | "client" | "global";

export interface ResolvedAiConfigWithOrigin extends ResolvedAiConfig {
  readonly origin: ResolvedAiOrigin;
}

/**
 * client-workflow "fix/kilo-file-editing-and-ai-status" — único punto
 * real de resolución de la IA a usar (prioridad: override de proyecto
 * → `defaultAi` del cliente → IA global activa). Antes existían DOS
 * implementaciones privadas idénticas de este mismo método
 * (`ProvisioningController.resolveAiConfig` y
 * `ContentGenerationController.resolveAiConfig`) — se consolidan aquí
 * en un único punto compartido, sin ningún cambio de comportamiento:
 * mismo origen de datos exacto (`project.configuration.settings["ai"]`,
 * `client.defaultAi`), mismo orden de prioridad.
 */
export async function resolveAiConfig(
  context: ApplicationContext,
  projectId: string | undefined,
  existingClientId: string | undefined
): Promise<ResolvedAiConfigWithOrigin> {
  if (projectId) {
    const project = context.projectManager?.getProject(projectId);
    const projectAi = project?.configuration.settings?.["ai"];
    if (projectAi && typeof projectAi === "object") {
      return { ...(projectAi as ResolvedAiConfig), origin: "project" };
    }
  }
  if (existingClientId && context.clientManager) {
    try {
      const client = await context.clientManager.getClient(existingClientId);
      if (client.defaultAi) return { ...client.defaultAi, origin: "client" };
    } catch {
      // Cliente no encontrado o error de lectura: se cae al fallback global, nunca se rompe la resolución.
    }
  }
  return { origin: "global" };
}
