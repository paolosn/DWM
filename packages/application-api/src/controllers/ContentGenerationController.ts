import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalString, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { resolveContentRoot } from "../resolveContentRoot.js";
import type { GenerationKind, GenerationResult, ResolvedAiConfig } from "@dwm/project-provisioning";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    /** Creación real con IA de un Agente/Skill/Regla — escribe directamente el formato real de Kilo, nunca JSON, en el alcance real indicado (global/cliente/proyecto). */
    "content-generation.generate": {
      payload: {
        kind: GenerationKind;
        id: string;
        instructions: string;
        clientId?: string;
        projectId?: string;
      };
      result: GenerationResult;
    };
    /** Genera el Markdown real con IA para previsualizar y editar SIN escribir ningún fichero todavía — mismo motor real que content-generation.generate, solo sin el paso de escritura. */
    "content-generation.preview": {
      payload: {
        kind: GenerationKind;
        id: string;
        instructions: string;
        clientId?: string;
        projectId?: string;
      };
      result: GenerationResult;
    };
  }
}

/**
 * client-workflow "kilo-content-integration" (Commit 4; alcance real
 * ampliado en "kilo-content-integration-completion") — controlador
 * fino: no genera nada por su cuenta, delega exclusivamente en
 * `ContentGenerationService`. El alcance (`clientId`/`projectId`, o
 * ninguno = global) decide DÓNDE se escribe el resultado, reutilizando
 * el mismo `resolveContentRoot` que ya usa `ContentScopeController` —
 * y también, cuando hay `clientId`, de dónde sale su `defaultAi`
 * (mismo esquema de prioridad ya establecido: override de proyecto →
 * `defaultAi` del cliente → IA global).
 */
export class ContentGenerationController implements ApplicationController {
  readonly resource = "content-generation";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const service = () =>
      requireDependency(this.context.contentGenerationService, "content-generation-service");

    const validateGeneratePayload = (payload: unknown) => {
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
        ...(optionalString(record, "clientId") !== undefined
          ? { clientId: optionalString(record, "clientId")! }
          : {}),
        ...(optionalString(record, "projectId") !== undefined
          ? { projectId: optionalString(record, "projectId")! }
          : {}),
      };
    };

    permissions.register("content-generation.generate", ["execute"]);
    operations.register({
      name: "content-generation.generate",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: validateGeneratePayload,
      handler: async (payload) => {
        const aiConfig = await this.resolveAiConfig(payload.projectId, payload.clientId);
        const writeRoot = await resolveContentRoot(this.context, {
          ...(payload.clientId ? { clientId: payload.clientId } : {}),
          ...(payload.projectId ? { projectId: payload.projectId } : {}),
        });
        return service().generateAndWrite(
          payload.kind,
          aiConfig,
          { id: payload.id, instructions: payload.instructions },
          writeRoot
        );
      },
    });

    permissions.register("content-generation.preview", ["execute"]);
    operations.register({
      name: "content-generation.preview",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: validateGeneratePayload,
      handler: async (payload) => {
        const aiConfig = await this.resolveAiConfig(payload.projectId, payload.clientId);
        return service().generate(payload.kind, aiConfig, {
          id: payload.id,
          instructions: payload.instructions,
        });
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
