import { promises as fs } from "node:fs";
import * as path from "node:path";
import { RequirementErrorCode } from "./errors/RequirementErrorCode.js";
import { createRequirementError } from "./errors/RequirementError.js";
import type {
  Requirement,
  RequirementCreateRequest,
  RequirementUpdateRequest,
} from "./RequirementTypes.js";

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const REQUIREMENTS_DIRNAME = "REQUERIMIENTOS";

export interface RequirementListFilter {
  readonly clientRoot: string;
  readonly projectId?: string;
  readonly profileId?: string;
}

/**
 * client-workflow "feature/requirement-workflow" (Commit 1) — el
 * Requerimiento/Trabajo es una entidad real y persistente (nunca
 * flotante), vinculada por referencia simple a cliente/perfil/
 * proyecto (mismos ids reales que ya usan ClientManager/
 * ProfileManager/ProjectManager — sin duplicar ninguno de los tres,
 * sin base de datos nueva). Persiste como JSON real dentro de la
 * carpeta del cliente (`<clientRoot>/REQUERIMIENTOS/<id>.json`),
 * mismo patrón físico ya usado por el resto de recursos reales del
 * Workspace.
 */
export class RequirementManager {
  private directory(clientRoot: string): string {
    return path.join(clientRoot, REQUIREMENTS_DIRNAME);
  }

  private filePath(clientRoot: string, id: string): string {
    this.assertValidId(id);
    return path.join(this.directory(clientRoot), `${id}.json`);
  }

  private assertValidId(id: string): void {
    if (!ID_PATTERN.test(id)) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_INVALID_ID,
        message: `"${id}" no es un identificador de requerimiento válido.`,
        origin: "id",
        recoverable: true,
      });
    }
  }

  async createRequirement(
    request: RequirementCreateRequest,
    clientRoot: string
  ): Promise<Requirement> {
    if (!request.title.trim()) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_INVALID_PAYLOAD,
        message: 'El campo "title" es obligatorio y debe ser una cadena no vacía.',
        origin: "validation",
        recoverable: true,
      });
    }
    const targetPath = this.filePath(clientRoot, request.id);
    if (await this.exists(targetPath)) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_ALREADY_EXISTS,
        message: `Ya existe un requerimiento con id "${request.id}" para este cliente.`,
        origin: "validation",
        recoverable: true,
      });
    }
    const now = new Date().toISOString();
    const requirement: Requirement = {
      id: request.id,
      title: request.title,
      description: request.description,
      type: request.type,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      clientId: request.clientId,
      ...(request.analysis !== undefined ? { analysis: request.analysis } : {}),
      ...(request.priority !== undefined ? { priority: request.priority } : {}),
      ...(request.profileId !== undefined ? { profileId: request.profileId } : {}),
      ...(request.projectId !== undefined ? { projectId: request.projectId } : {}),
      ...(request.briefing !== undefined ? { briefing: request.briefing } : {}),
      ...(request.recommendedResources !== undefined
        ? { recommendedResources: request.recommendedResources }
        : {}),
      ...(request.notes !== undefined ? { notes: request.notes } : {}),
    };
    await fs.mkdir(this.directory(clientRoot), { recursive: true });
    await this.write(targetPath, requirement);
    return requirement;
  }

  async getRequirement(id: string, clientRoot: string): Promise<Requirement> {
    return this.read(this.filePath(clientRoot, id), id);
  }

  async listRequirements(filter: RequirementListFilter): Promise<Requirement[]> {
    const dir = this.directory(filter.clientRoot);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const requirements: Requirement[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const requirement = await this.read(path.join(dir, entry), entry.replace(/\.json$/, ""));
        requirements.push(requirement);
      } catch {
        // Un fichero corrupto no debe romper el listado del resto de requerimientos reales.
      }
    }
    return requirements
      .filter((r) => (filter.projectId ? r.projectId === filter.projectId : true))
      .filter((r) => (filter.profileId ? r.profileId === filter.profileId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateRequirement(
    id: string,
    updates: RequirementUpdateRequest,
    clientRoot: string
  ): Promise<Requirement> {
    const existing = await this.getRequirement(id, clientRoot);
    const updated: Requirement = {
      ...existing,
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.status !== undefined ? { status: updates.status } : {}),
      ...(updates.priority !== undefined ? { priority: updates.priority } : {}),
      ...(updates.profileId !== undefined ? { profileId: updates.profileId } : {}),
      ...(updates.projectId !== undefined ? { projectId: updates.projectId } : {}),
      ...(updates.briefing !== undefined ? { briefing: updates.briefing } : {}),
      ...(updates.recommendedResources !== undefined
        ? { recommendedResources: updates.recommendedResources }
        : {}),
      ...(updates.appliedResources !== undefined
        ? { appliedResources: updates.appliedResources }
        : {}),
      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.write(this.filePath(clientRoot, id), updated);
    return updated;
  }

  /**
   * Vincula el requerimiento a un proyecto real (nunca queda
   * flotante tras "Cliente acepta"). Reutiliza `updateRequirement`
   * tal cual — sin lógica paralela.
   */
  async linkToProject(id: string, projectId: string, clientRoot: string): Promise<Requirement> {
    return this.updateRequirement(id, { projectId, status: "linked" }, clientRoot);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async read(filePath: string, id: string): Promise<Requirement> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_NOT_FOUND,
        message: `No existe ningún requerimiento con id "${id}".`,
        origin: "repository",
        recoverable: true,
        cause: err,
      });
    }
    try {
      return JSON.parse(raw) as Requirement;
    } catch (err) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_IO_ERROR,
        message: `El fichero del requerimiento "${id}" no contiene JSON válido.`,
        origin: "repository",
        recoverable: false,
        cause: err,
      });
    }
  }

  private async write(filePath: string, requirement: Requirement): Promise<void> {
    try {
      await fs.writeFile(filePath, JSON.stringify(requirement, null, 2), "utf-8");
    } catch (err) {
      throw createRequirementError({
        code: RequirementErrorCode.REQUIREMENT_IO_ERROR,
        message: `No se pudo escribir el requerimiento "${requirement.id}" en disco.`,
        origin: "repository",
        recoverable: true,
        cause: err,
      });
    }
  }
}
