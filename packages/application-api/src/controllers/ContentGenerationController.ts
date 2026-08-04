import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalString, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import type { GenerationKind, GenerationResult, ResolvedAiConfig } from "@dwm/project-provisioning";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /** Creación real con IA de un Agente/Skill/Regla — escribe directamente el formato real de Kilo, nunca JSON. */
    "content-generation.generate": {
      payload: {
        kind: GenerationKind;
        id: string;
        instructions: string;
        existingClientId?: string;
        projectId?: string;
      };
      result: GenerationResult;
    };
  }
}

/**
 * client-workflow "kilo-content-integration" (Commit 4) — controlador
 * fino: no genera nada por su cuenta, delega exclusivamente en
 * `ContentGenerationService` (que a su vez reutiliza
 * `AIManager`/`AIProviderRegistry`/`HttpAIProvider`/`SecretsManager` ya
 * existentes). La resolución de configuración de IA reutiliza el mismo
 * esquema de prioridad ya establecido (override de proyecto →
 * `defaultAi` del cliente → IA global activa).
 */
export class ContentGenerationController implements ApplicationController {
  readonly resource = "content-generation";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const service = () =>
      requireDependency(this.context.contentGenerationService, "content-generation-service");

    const root = (): string | undefined =>
      this.context.portableWorkspaceManager?.getActiveWorkspace()?.root;

    permissions.register("content-generation.generate", ["execute"]);
    operations.register({
      name: "content-generation.generate",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const kind = requireString(record, "kind");
        if (kind !== "agent" && kind !== "skill" && kind !== "rule") {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: '"kind" debe ser "agent", "skill" o "rule".',
            origin: "validation",
            category: "validation",
            retryable: false,
            recoverable: true,
          });
        }
        return {
          kind: kind as GenerationKind,
          id: requireString(record, "id"),
          instructions: requireString(record, "instructions"),
          ...(optionalString(record, "existingClientId") !== undefined
            ? { existingClientId: optionalString(record, "existingClientId")! }
            : {}),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
        };
      },
      handler: async (payload) => {
        const aiConfig = await this.resolveAiConfig(payload.projectId, payload.existingClientId);
        return service().generateAndWrite(
          payload.kind,
          aiConfig,
          { id: payload.id, instructions: payload.instructions },
          root()
        );
      },
    });
  }

  /**
   * Mismo esquema de prioridad que `ProvisioningController.resolveAiConfig`
   * (override de proyecto → `defaultAi` del cliente → IA global): se
   * repite aquí, deliberadamente pequeño, en vez de acoplar dos
   * controladores entre sí; no hay ninguna lógica de IA en este método,
   * solo arma el `ResolvedAiConfig` que ya consume `ContentGenerationService`.
   */
  private async resolveAiConfig(
    projectId: string | undefined,
    existingClientId: string | undefined
  ): Promise<ResolvedAiConfig> {
    if (projectId) {
      const project = this.context.projectManager?.getProject(projectId);
      const projectAi = project?.configuration.settings?.["ai"];
      if (projectAi && typeof projectAi === "object") {
        return projectAi as ResolvedAiConfig;
      }
    }
    if (existingClientId && this.context.clientManager) {
      try {
        const client = await this.context.clientManager.getClient(existingClientId);
        if (client.defaultAi) return client.defaultAi;
      } catch {
        // Cliente no encontrado o error de lectura: se cae al fallback global, nunca se rompe la generación.
      }
    }
    return {};
  }
}
