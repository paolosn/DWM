import { promises as fs } from "node:fs";
import * as path from "node:path";
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

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * client-workflow "fix/kilo-psn-base-global-root" — único punto de
 * resolución del alcance real (global/cliente/proyecto) para
 * Agentes/Skills/Reglas, reutilizado por `ContentScopeController`,
 * `ContentSyncController` y `ContentGenerationController`. Nunca
 * decide nada de sincronización por su cuenta: solo calcula qué `root`
 * real pasar a `AgentManager`/`SkillManager`/`RuleManager`, que ya
 * aceptaban un `root` arbitrario.
 *
 * - Sin `clientId` ni `projectId`: alcance GLOBAL. La raíz del
 *   Workspace (`active.root`) es solo la raíz del SISTEMA — la
 *   Biblioteca IA global real vive dentro de `PSN-BASE`
 *   (`<active.root>/PSN-BASE`, la plantilla que se duplica al crear
 *   cada proyecto). Nunca `<active.root>/.kilo` directamente: eso
 *   ignoraría por completo el contenido real ya existente en
 *   PSN-BASE. Si `PSN-BASE` no existe físicamente en la raíz activa,
 *   se lanza un error real y claro — nunca se inventa
 *   `<active.root>/.kilo` en su lugar.
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

  const psnBaseRoot = path.join(active.root, "PSN-BASE");
  if (!(await pathExists(psnBaseRoot))) {
    notFound(
      `No se encontró "PSN-BASE" en el Sistema de Trabajo activo ("${active.root}"). La Biblioteca IA global vive en <Sistema de Trabajo>/PSN-BASE — comprueba que la carpeta existe físicamente.`
    );
  }
  if (context.psnAdapter && !context.psnAdapter.getModel(psnBaseRoot)) {
    await context.psnAdapter.scanWorkspace(psnBaseRoot);
  }
  return psnBaseRoot;
}
