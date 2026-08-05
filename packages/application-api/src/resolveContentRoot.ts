import { resolveClientContentRoot, ensureClientKiloSkeleton } from "@dwm/project-provisioning";
import { isSafeClientId } from "@dwm/client-manager";
import type { ApplicationContext } from "./ApplicationContext.js";
import { createApplicationError } from "./errors/ApplicationError.js";
import { ApplicationErrorCode } from "./errors/ApplicationErrorCode.js";

export interface ContentScope {
  readonly clientId?: string;
  readonly projectId?: string;
}

function notFound(message: string): never {
  throw createApplicationError({
    code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
    message,
    origin: "validation",
    category: "not-found",
    retryable: false,
    recoverable: true,
  });
}

/**
 * client-workflow "kilo-content-integration-completion" — único punto
 * de resolución del alcance real (global/cliente/proyecto) para
 * Agentes/Skills/Reglas, reutilizado por `ContentScopeController`,
 * `ContentSyncController` y `ContentGenerationController`. Nunca
 * decide nada de sincronización por su cuenta: solo calcula qué `root`
 * real pasar a `AgentManager`/`SkillManager`/`RuleManager`, que ya
 * aceptaban un `root` arbitrario.
 *
 * - Sin `clientId` ni `projectId`: alcance global (Workspace activo).
 * - `projectId`: la ruta real del proyecto ya registrado (su `.kilo`
 *   ya existe siempre, duplicado de PSN-BASE al crearse).
 * - `clientId`: `CLIENTES/<clientId>/.kilo/...` (ver
 *   `resolveClientContentRoot`). La primera vez que se usa un cliente,
 *   su `.kilo/agents|skills|rules` todavía no existe físicamente —
 *   `@dwm/psn-adapter` solo reconoce un recurso si su carpeta ya
 *   existe al escanear, así que aquí se crea el esqueleto mínimo
 *   (`ensureClientKiloSkeleton`, sin duplicar la función equivalente
 *   ya existente para el Workspace) y se escanea antes de devolver la
 *   raíz.
 */
export async function resolveContentRoot(
  context: ApplicationContext,
  scope: ContentScope
): Promise<string> {
  if (scope.projectId) {
    const project = context.projectManager?.getProject(scope.projectId);
    if (!project) notFound(`No existe ningún proyecto con id "${scope.projectId}".`);
    return project.configuration.projectPath;
  }

  const active = context.portableWorkspaceManager?.getActiveWorkspace();
  if (!active) notFound("No hay ningún Sistema de Trabajo activo.");

  if (scope.clientId) {
    if (!isSafeClientId(scope.clientId)) {
      throw createApplicationError({
        code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
        message: `"clientId" no es un identificador de cliente válido: "${scope.clientId}".`,
        origin: "validation",
        category: "validation",
        retryable: false,
        recoverable: true,
      });
    }
    const clientRoot = resolveClientContentRoot(active.root, scope.clientId);
    await ensureClientKiloSkeleton(clientRoot);
    if (context.psnAdapter && !context.psnAdapter.getModel(clientRoot)) {
      await context.psnAdapter.scanWorkspace(clientRoot);
    }
    return clientRoot;
  }
  return active.root;
}
