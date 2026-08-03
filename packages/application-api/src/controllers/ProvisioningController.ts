import type { ApplicationController } from "../ApplicationRegistry.js";
import type { ApplicationOperationRegistry } from "../ApplicationOperationRegistry.js";
import type { ApplicationPermissions } from "../ApplicationPermissions.js";
import type { ApplicationContext } from "../ApplicationContext.js";
import { requireDependency } from "../requireDependency.js";
import { asRecord, optionalString, optionalStringArray, requireString } from "../payloadHelpers.js";
import { createApplicationError } from "../errors/ApplicationError.js";
import { ApplicationErrorCode } from "../errors/ApplicationErrorCode.js";
import { appendClientActivity } from "../ActivityLog.js";
import {
  PROJECT_PROVISIONING_CATEGORIES,
  type ClientIntakeData,
  type ProjectIntakeData,
  type ProjectProvisioningCategory,
  type ProvisionProjectResult,
  type ViabilityBriefingInput,
  type ViabilityReport,
  type ResolvedAiConfig,
} from "@dwm/project-provisioning";

declare module "../ApplicationRequest.js" {
  interface ApplicationOperationMap {
    "provisioning.create-project": {
      payload: {
        category: ProjectProvisioningCategory;
        existingClientId?: string;
        client?: ClientIntakeData;
        project: ProjectIntakeData;
        briefing?: ViabilityBriefingInput;
      };
      result: ProvisionProjectResult & {
        readonly vsCodeOpened: boolean;
        readonly vsCodeMessage: string;
      };
    };
    /** Motor real de viabilidad con IA (cierre de limitaciones, item 6). Nunca persiste nada; solo devuelve el informe estructurado. */
    "provisioning.analyze-viability": {
      payload: {
        existingClientId?: string;
        projectId?: string;
        project: {
          projectName: string;
          descripcion: string;
          objetivo?: string;
          presupuesto?: string;
          plazo?: string;
          tecnologia?: string;
          notas?: string;
        };
      };
      result: ViabilityReport;
    };
  }
}

function invalidPayload(message: string): never {
  throw createApplicationError({
    code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
    message,
    origin: "validation",
    category: "validation",
    retryable: false,
    recoverable: true,
  });
}

function readClient(record: Record<string, unknown>): ClientIntakeData | undefined {
  const value = record["client"];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) invalidPayload('"client" debe ser un objeto.');
  const client = value as Record<string, unknown>;
  const name = client["name"];
  if (typeof name !== "string" || name.trim().length === 0) {
    invalidPayload('"client.name" es obligatorio.');
  }
  return {
    name,
    ...(optionalString(client, "empresa") !== undefined
      ? { empresa: optionalString(client, "empresa")! }
      : {}),
    ...(optionalString(client, "email") !== undefined
      ? { email: optionalString(client, "email")! }
      : {}),
    ...(optionalString(client, "telefono") !== undefined
      ? { telefono: optionalString(client, "telefono")! }
      : {}),
    ...(optionalString(client, "notas") !== undefined
      ? { notas: optionalString(client, "notas")! }
      : {}),
  };
}

function readProject(record: Record<string, unknown>): ProjectIntakeData {
  const value = record["project"];
  if (typeof value !== "object" || value === null) invalidPayload('"project" es obligatorio.');
  const project = value as Record<string, unknown>;
  const name = project["name"];
  if (typeof name !== "string" || name.trim().length === 0) {
    invalidPayload('"project.name" es obligatorio.');
  }
  return {
    name,
    ...(optionalString(project, "description") !== undefined
      ? { description: optionalString(project, "description")! }
      : {}),
    ...(optionalString(project, "tipoTrabajo") !== undefined
      ? { tipoTrabajo: optionalString(project, "tipoTrabajo")! }
      : {}),
    ...(optionalString(project, "precioOModalidad") !== undefined
      ? { precioOModalidad: optionalString(project, "precioOModalidad")! }
      : {}),
    ...(optionalString(project, "plazo") !== undefined
      ? { plazo: optionalString(project, "plazo")! }
      : {}),
    ...(optionalString(project, "notas") !== undefined
      ? { notas: optionalString(project, "notas")! }
      : {}),
    ...(optionalString(project, "origen") !== undefined
      ? { origen: optionalString(project, "origen")! }
      : {}),
  };
}

function readBriefing(record: Record<string, unknown>): ViabilityBriefingInput | undefined {
  const value = record["briefing"];
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) invalidPayload('"briefing" debe ser un objeto.');
  const briefing = value as Record<string, unknown>;
  return {
    ...(optionalString(briefing, "veredicto") !== undefined
      ? { veredicto: optionalString(briefing, "veredicto")! }
      : {}),
    ...(optionalString(briefing, "explicacionVeredicto") !== undefined
      ? { explicacionVeredicto: optionalString(briefing, "explicacionVeredicto")! }
      : {}),
    ...(optionalString(briefing, "precioMercado") !== undefined
      ? { precioMercado: optionalString(briefing, "precioMercado")! }
      : {}),
    ...(optionalString(briefing, "precioMinimoRecomendado") !== undefined
      ? { precioMinimoRecomendado: optionalString(briefing, "precioMinimoRecomendado")! }
      : {}),
    ...(optionalString(briefing, "presupuestoCliente") !== undefined
      ? { presupuestoCliente: optionalString(briefing, "presupuestoCliente")! }
      : {}),
    ...(optionalString(briefing, "notasNegociacion") !== undefined
      ? { notasNegociacion: optionalString(briefing, "notasNegociacion")! }
      : {}),
    ...(optionalStringArray(briefing, "equipoNecesario") !== undefined
      ? { equipoNecesario: optionalStringArray(briefing, "equipoNecesario")! }
      : {}),
    ...(optionalStringArray(briefing, "riesgos") !== undefined
      ? { riesgos: optionalStringArray(briefing, "riesgos")! }
      : {}),
    ...(optionalStringArray(briefing, "preguntasAlCliente") !== undefined
      ? { preguntasAlCliente: optionalStringArray(briefing, "preguntasAlCliente")! }
      : {}),
    ...(optionalStringArray(briefing, "serviciosExternos") !== undefined
      ? { serviciosExternos: optionalStringArray(briefing, "serviciosExternos")! }
      : {}),
    ...(optionalString(briefing, "siguientePaso") !== undefined
      ? { siguientePaso: optionalString(briefing, "siguientePaso")! }
      : {}),
  };
}

/**
 * client-workflow-v2 — controlador del flujo humano principal
 * (Viabilidad/Auditoría/Seguridad/Nuevo proyecto directo, README
 * secciones 1-3). Una única operación (`provisioning.create-project`,
 * discriminada por `category`) delega por completo en
 * `ProjectProvisioningService`; el `workspaceRoot` nunca lo indica el
 * cliente — se resuelve aquí mismo a partir del Workspace activo real,
 * igual que ya hace `WorkspaceController`.
 */
export class ProvisioningController implements ApplicationController {
  readonly resource = "provisioning";

  constructor(private readonly context: ApplicationContext) {}

  register(operations: ApplicationOperationRegistry, permissions: ApplicationPermissions): void {
    const service = () =>
      requireDependency(this.context.projectProvisioningService, "project-provisioning");
    const workspaceManager = () =>
      requireDependency(this.context.portableWorkspaceManager, "portable-workspace-manager");

    permissions.register("provisioning.create-project", ["write"], { destructive: false });
    operations.register({
      name: "provisioning.create-project",
      version: "1.0.0",
      capabilities: ["write"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const category = requireString(record, "category");
        if (!PROJECT_PROVISIONING_CATEGORIES.includes(category as ProjectProvisioningCategory)) {
          invalidPayload(
            `"category" debe ser una de: ${PROJECT_PROVISIONING_CATEGORIES.join(", ")}.`
          );
        }
        const existingClientId = optionalString(record, "existingClientId");
        const client = readClient(record);
        const project = readProject(record);
        const briefing = readBriefing(record);
        if (!existingClientId && !client) {
          invalidPayload(
            'Se requiere "existingClientId" o los datos de un cliente nuevo en "client".'
          );
        }
        return {
          category: category as ProjectProvisioningCategory,
          ...(existingClientId !== undefined ? { existingClientId } : {}),
          ...(client !== undefined ? { client } : {}),
          project,
          ...(briefing !== undefined ? { briefing } : {}),
        };
      },
      handler: async (payload) => {
        const active = workspaceManager().getActiveWorkspace();
        if (!active) {
          throw createApplicationError({
            code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
            message: "No hay ningún Sistema de Trabajo activo: créalo o impórtalo primero.",
            origin: "validation",
            category: "not-found",
            retryable: false,
            recoverable: true,
          });
        }
        const result = await service().provisionProject(active.root, payload);

        // "Registrar en Actividad" (encargo, cierre de limitaciones item 3):
        // entradas reales, escritas en el mismo momento en que ocurre la
        // acción — nunca texto estático. Secundario siempre: un fallo aquí
        // nunca debe deshacer ni ocultar que el proyecto ya se creó.
        if (result.clientCreated) {
          await appendClientActivity(active.root, result.clientId, {
            type: "client.created",
            message: `Cliente creado (${payload.client?.name ?? result.clientId}).`,
          }).catch(() => {});
        }
        await appendClientActivity(active.root, result.clientId, {
          type: "project.created",
          message: `Proyecto «${payload.project.name}» creado (${payload.category}).`,
          relatedProjectId: result.projectId,
        }).catch(() => {});

        // "Abrir automáticamente VS Code" (encargo, punto 3): reutiliza tal
        // cual EnvironmentManager.openInVSCode(), el mismo ProcessRunner ya
        // probado por VSCodeDetector — no es un segundo lanzador. Opcional:
        // si environment-manager no está conectado, se informa sin fallar.
        const environmentManager = this.context.environmentManager;
        const launch = environmentManager
          ? await environmentManager.openInVSCode(result.projectPath)
          : {
              opened: false,
              message: "El proyecto se creó correctamente; no se pudo comprobar VS Code.",
            };
        if (launch.opened) {
          await appendClientActivity(active.root, result.clientId, {
            type: "project.opened-in-vscode",
            message: `VS Code abierto para «${payload.project.name}».`,
            relatedProjectId: result.projectId,
          }).catch(() => {});
        }

        return { ...result, vsCodeOpened: launch.opened, vsCodeMessage: launch.message };
      },
    });

    // "Viabilidad con IA" (encargo, cierre de limitaciones item 6):
    // reutiliza tal cual ViabilityAnalysisService (que a su vez reutiliza
    // AIManager/AIProviderRegistry/SecretsManager, ya cableados) — sin
    // motor propio ni segundo resolutor de configuración de IA.
    permissions.register("provisioning.analyze-viability", ["execute"]);
    operations.register({
      name: "provisioning.analyze-viability",
      version: "1.0.0",
      capabilities: ["execute"],
      long: true,
      validatePayload: (payload) => {
        const record = asRecord(payload);
        const projectRecord = asRecord(record["project"]);
        const projectName = requireString(projectRecord, "projectName");
        const descripcion = requireString(projectRecord, "descripcion");
        return {
          ...(optionalString(record, "existingClientId") !== undefined
            ? { existingClientId: optionalString(record, "existingClientId")! }
            : {}),
          ...(optionalString(record, "projectId") !== undefined
            ? { projectId: optionalString(record, "projectId")! }
            : {}),
          project: {
            projectName,
            descripcion,
            ...(optionalString(projectRecord, "objetivo") !== undefined
              ? { objetivo: optionalString(projectRecord, "objetivo")! }
              : {}),
            ...(optionalString(projectRecord, "presupuesto") !== undefined
              ? { presupuesto: optionalString(projectRecord, "presupuesto")! }
              : {}),
            ...(optionalString(projectRecord, "plazo") !== undefined
              ? { plazo: optionalString(projectRecord, "plazo")! }
              : {}),
            ...(optionalString(projectRecord, "tecnologia") !== undefined
              ? { tecnologia: optionalString(projectRecord, "tecnologia")! }
              : {}),
            ...(optionalString(projectRecord, "notas") !== undefined
              ? { notas: optionalString(projectRecord, "notas")! }
              : {}),
          },
        };
      },
      handler: async (payload) => {
        const viabilityService = requireDependency(
          this.context.viabilityAnalysisService,
          "viability-analysis-service"
        );
        const aiConfig = await this.resolveAiConfig(payload.projectId, payload.existingClientId);
        return viabilityService.analyze(aiConfig, payload.project);
      },
    });
  }

  /**
   * Único punto de resolución de la configuración de IA a usar (encargo,
   * item 6: "override de proyecto → defaultAi del cliente → IA global").
   * No es un resolutor paralelo: solo arma el `ResolvedAiConfig` real que
   * ya consume `ViabilityAnalysisService`; nunca decide nada por su
   * cuenta ni retiene un valor de secreto (solo su referencia).
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
        // Cliente no encontrado o error de lectura: se cae al fallback global, nunca se rompe el análisis.
      }
    }
    return {};
  }
}
