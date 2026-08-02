import { promises as fs } from "node:fs";
import * as path from "node:path";
import { ImportScanner, ImportService } from "@dwm/import-manager";
import type { ProjectManager } from "@dwm/project";
import type { ClientManager } from "@dwm/client-manager";
import { ClientErrorCode } from "@dwm/client-manager";
import type { ProfileManager } from "@dwm/profile";
import {
  categoryFolderName,
  type ProvisionProjectRequest,
  type ProvisionProjectResult,
} from "./ProjectProvisioningTypes.js";
import { sanitizeClientIdentifier, sanitizeProjectFolderName } from "./ProjectNaming.js";
import { buildBriefingMarkdown } from "./BriefingTemplate.js";
import { ProjectProvisioningErrorCode } from "./errors/ProjectProvisioningErrorCode.js";
import { createProjectProvisioningError } from "./errors/ProjectProvisioningError.js";

const ESTADO_FILE = "estado-proyecto.md";
const CLIENTE_FILE = "cliente.json";
const BRIEFING_FILE = "briefing-inicial.md";
const ESTADO_PLACEHOLDER = "Pendiente de definir";

/** Excluye del duplicado de PSN-BASE lo que PSN-PANEL también excluye/regenera, y nada de secretos. */
const PSN_BASE_EXCLUDE_PATTERNS = [
  "node_modules",
  "node_modules/**",
  "**/node_modules/**",
  "**/.cache/**",
  "**/*.tmp",
  "**/.DS_Store",
  CLIENTE_FILE,
];

export interface ProjectProvisioningServiceOptions {
  readonly importScanner?: ImportScanner;
  readonly importService?: ImportService;
  readonly projectManager: ProjectManager;
  readonly clientManager: ClientManager;
  readonly profileManager: ProfileManager;
}

/**
 * Módulo "client-workflow-v2" — orquestador de creación automática de
 * proyectos, reproduciendo el flujo real de
 * `SISTEMA-DE-TRABAJO/PSN-PANEL/app.js` (`crearProyecto()`,
 * `copyDirectory()`) sobre la arquitectura ya existente de DWM: **no**
 * implementa su propio motor de copia ni de rollback — reutiliza
 * `ImportScanner`/`ImportService` de `@dwm/import-manager` tal cual
 * (staging → verificación → commit atómico, o descarte del staging ante
 * cualquier fallo, ya construido ahí). Solo añade la coordinación
 * específica de este flujo: duplicar PSN-BASE excluyendo su
 * `cliente.json` plantilla, reescribir `estado-proyecto.md`, generar un
 * `cliente.json` real (nunca con secretos) y, cuando hay un análisis de
 * viabilidad aceptado, `briefing-inicial.md` — y crear/reutilizar el
 * cliente y registrar el proyecto reutilizando `ClientManager` y
 * `ProjectManager` tal cual.
 */
export class ProjectProvisioningService {
  private readonly importScanner: ImportScanner;
  private readonly importService: ImportService;
  private readonly projectManager: ProjectManager;
  private readonly clientManager: ClientManager;
  private readonly profileManager: ProfileManager;

  constructor(options: ProjectProvisioningServiceOptions) {
    this.importScanner = options.importScanner ?? new ImportScanner();
    this.importService = options.importService ?? new ImportService();
    this.projectManager = options.projectManager;
    this.clientManager = options.clientManager;
    this.profileManager = options.profileManager;
  }

  async provisionProject(
    workspaceRoot: string,
    request: ProvisionProjectRequest
  ): Promise<ProvisionProjectResult> {
    this.assertValidRequest(request);

    const psnBasePath = path.join(workspaceRoot, "PSN-BASE");
    await this.assertPsnBaseExists(psnBasePath);

    const profileId = this.resolveProfileId();

    const categoryDir = path.join(workspaceRoot, "PROYECTOS", categoryFolderName(request.category));
    await fs.mkdir(categoryDir, { recursive: true });

    const folderName = sanitizeProjectFolderName(request.project.name);
    const destinationPath = this.resolveSafeDestination(categoryDir, folderName);

    await this.duplicatePsnBase(psnBasePath, destinationPath, request);

    let clientId: string;
    let clientCreated: boolean;
    try {
      const outcome = await this.resolveClient(request);
      clientId = outcome.clientId;
      clientCreated = outcome.created;

      const project = await this.projectManager.createProject(
        request.project.name,
        request.project.description ?? "",
        {
          projectPath: destinationPath,
          profileId,
          clientId,
          usedTools: [],
          usedAdapters: [],
        }
      );

      await this.clientManager.addReference(clientId, "projects", project.id);

      // "Marcar el proyecto como activo" (encargo, punto 3): reutiliza
      // ProjectManager.openProject() tal cual — no es un fallo crítico si
      // no puede activarse (p. ej. perfil no localizable todavía), el
      // proyecto ya está creado y registrado correctamente.
      await this.projectManager.openProject(project.id).catch(() => {});

      return {
        projectId: project.id,
        clientId,
        clientCreated,
        projectPath: destinationPath,
        briefingGenerated: request.briefing !== undefined,
      };
    } catch (err) {
      // La carpeta del proyecto ya se materializó (commitStaging ya se
      // ejecutó): si el registro cliente/proyecto falla después, no debe
      // quedar un proyecto "fantasma" en disco sin registrar (README
      // "no dejar proyectos parciales tras un error").
      await fs.rm(destinationPath, { recursive: true, force: true }).catch(() => {});
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
        message:
          err instanceof Error
            ? `No se pudo completar el registro del proyecto: ${err.message}`
            : "No se pudo completar el registro del proyecto.",
        origin: "project",
        recoverable: true,
        cause: err,
      });
    }
  }

  /** Escanea y copia PSN-BASE a `destinationPath` vía el staging/commit de `ImportService`, con el post-proceso de contenido (estado/cliente/briefing) hecho en staging antes de comprometer — así un fallo en cualquier paso deja el staging descartado, nunca un proyecto a medias. */
  private async duplicatePsnBase(
    psnBasePath: string,
    destinationPath: string,
    request: ProvisionProjectRequest
  ): Promise<void> {
    const scan = await this.importScanner.scanFolder(psnBasePath, PSN_BASE_EXCLUDE_PATTERNS);
    const stagingDir = this.importService.createStagingDir(path.dirname(destinationPath));

    // copyToStaging ya hace rollback (borra el staging) por sí mismo ante
    // cualquier fallo propio; no se duplica esa lógica aquí.
    await this.importService.copyToStaging("folder", psnBasePath, scan, stagingDir);

    try {
      await this.rewriteEstadoProyecto(stagingDir, request.project.name);
      await this.writeClienteJson(stagingDir, request);
      if (request.briefing) {
        await this.writeBriefing(stagingDir, request);
      }
    } catch (err) {
      await this.importService.rollbackStaging(stagingDir).catch(() => {});
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_COPY_FAILED,
        message:
          err instanceof Error
            ? `Fallo al preparar el contenido del nuevo proyecto: ${err.message}`
            : "Fallo al preparar el contenido del nuevo proyecto.",
        origin: "copy",
        recoverable: true,
        cause: err,
      });
    }

    await this.importService.commitStaging(stagingDir, destinationPath, false);
  }

  private async rewriteEstadoProyecto(stagingDir: string, projectName: string): Promise<void> {
    const estadoPath = path.join(stagingDir, ESTADO_FILE);
    let content: string;
    try {
      content = await fs.readFile(estadoPath, "utf-8");
    } catch {
      return; // PSN-BASE no siempre incluye el fichero; no es un fallo.
    }
    const rewritten = content.split(ESTADO_PLACEHOLDER).join(projectName);
    await fs.writeFile(estadoPath, rewritten, "utf-8");
  }

  private async writeClienteJson(
    stagingDir: string,
    request: ProvisionProjectRequest
  ): Promise<void> {
    const now = new Date().toISOString();
    const clienteData: Record<string, unknown> = {
      nombre: request.client?.name ?? "",
      empresa: request.client?.empresa ?? "",
      email: request.client?.email ?? "",
      telefono: request.client?.telefono ?? "",
      descripcion: request.project.description ?? "",
      tipo_proyecto: request.project.tipoTrabajo ?? request.category,
      precio_o_modalidad: request.project.precioOModalidad ?? "",
      plazo: request.project.plazo ?? "",
      notas: request.project.notas ?? "",
      fecha_creacion: now,
      estado_proyecto: "activo",
      sistema_version: "DWM client-workflow-v2",
      origen_proyecto: request.project.origen ?? request.category,
      categoria: request.category,
    };
    // Regla obligatoria (encargo, sección 6): nunca contraseñas, tokens ni
    // claves en cliente.json — solo los campos de negocio anteriores.
    await fs.writeFile(
      path.join(stagingDir, CLIENTE_FILE),
      `${JSON.stringify(clienteData, null, 2)}\n`,
      "utf-8"
    );
  }

  private async writeBriefing(stagingDir: string, request: ProvisionProjectRequest): Promise<void> {
    if (!request.briefing) return;
    const markdown = buildBriefingMarkdown(request.project.name, request.briefing);
    await fs.writeFile(path.join(stagingDir, BRIEFING_FILE), markdown, "utf-8");
  }

  private async resolveClient(
    request: ProvisionProjectRequest
  ): Promise<{ clientId: string; created: boolean }> {
    if (request.existingClientId) {
      // Reutilizar explícitamente: si no existe, es un error real, no se crea uno nuevo en su lugar.
      await this.clientManager.getClient(request.existingClientId);
      return { clientId: request.existingClientId, created: false };
    }

    if (!request.client) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: "Se requiere 'existingClientId' o los datos de un cliente nuevo ('client').",
        origin: "request",
        recoverable: true,
      });
    }

    const clientId = sanitizeClientIdentifier(request.client.name);
    try {
      await this.clientManager.getClient(clientId);
      return { clientId, created: false };
    } catch (err) {
      if (this.isClientNotFound(err)) {
        await this.clientManager.createClient({
          id: clientId,
          name: request.client.name,
          slug: clientId,
          ...(request.client.notas ? { description: request.client.notas } : {}),
        });
        return { clientId, created: true };
      }
      throw err;
    }
  }

  private isClientNotFound(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === ClientErrorCode.CLIENT_NOT_FOUND
    );
  }

  private resolveProfileId(): string {
    const active = this.profileManager.getActiveProfile();
    if (active) return active.id;
    const [first] = this.profileManager.listProfiles();
    if (first) return first;
    throw createProjectProvisioningError({
      code: ProjectProvisioningErrorCode.PROVISIONING_NO_ACTIVE_PROFILE,
      message:
        "No hay ningún perfil activo ni registrado: no se puede crear el proyecto automáticamente sin pedirle uno al usuario.",
      origin: "profile",
      recoverable: true,
    });
  }

  private resolveSafeDestination(categoryDir: string, folderName: string): string {
    const resolvedCategoryDir = path.resolve(categoryDir);
    const resolvedTarget = path.resolve(path.join(categoryDir, folderName));
    if (
      resolvedTarget !== resolvedCategoryDir &&
      !resolvedTarget.startsWith(resolvedCategoryDir + path.sep)
    ) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_UNSAFE_PATH,
        message: `El nombre de proyecto "${folderName}" resuelve fuera de la categoría "${categoryDir}".`,
        origin: "path",
        recoverable: true,
      });
    }
    return resolvedTarget;
  }

  private async assertPsnBaseExists(psnBasePath: string): Promise<void> {
    try {
      const stat = await fs.stat(psnBasePath);
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch (err) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_PSN_BASE_NOT_FOUND,
        message: `No se encontró "PSN-BASE" en el Workspace activo ("${psnBasePath}").`,
        origin: "psn-base",
        recoverable: true,
        cause: err,
      });
    }
  }

  private assertValidRequest(request: ProvisionProjectRequest): void {
    if (!request || typeof request !== "object") {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: "La petición de aprovisionamiento es obligatoria.",
        origin: "request",
        recoverable: true,
      });
    }
    if (!request.project || !request.project.name || !request.project.name.trim()) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: 'El campo "project.name" es obligatorio.',
        origin: "request",
        recoverable: true,
      });
    }
    if (!request.existingClientId && !request.client?.name) {
      throw createProjectProvisioningError({
        code: ProjectProvisioningErrorCode.PROVISIONING_INVALID_REQUEST,
        message: 'Se requiere "existingClientId" o "client.name".',
        origin: "request",
        recoverable: true,
      });
    }
  }
}
