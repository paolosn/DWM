import type { Project } from "./Project.js";
import { isProjectStateTransitionAllowed, type ProjectState } from "./ProjectState.js";
import { ProjectErrorCode } from "./errors/ProjectErrorCode.js";
import { createProjectError } from "./errors/ProjectError.js";

/** Mantiene el conjunto de proyectos registrados (caché en memoria) y cuál está activo. */
export class ProjectRegistry {
  private readonly projects = new Map<string, Project>();
  private activeId: string | null = null;

  register(project: Project): void {
    if (this.projects.has(project.id)) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_ALREADY_EXISTS,
        message: `Ya existe un proyecto registrado con id "${project.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.projects.set(project.id, project);
  }

  unregister(id: string): void {
    this.projects.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  require(id: string): Project {
    const project = this.projects.get(id);
    if (!project) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_NOT_FOUND,
        message: `No existe ningún proyecto registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return project;
  }

  list(): string[] {
    return [...this.projects.keys()].sort();
  }

  /** Aplica la transición de estado; si `next` es "open" fija este proyecto como activo, y si el activo deja de estarlo, limpia el activo. */
  setState(id: string, next: ProjectState): void {
    const project = this.require(id);
    if (!isProjectStateTransitionAllowed(project.state, next)) {
      throw createProjectError({
        code: ProjectErrorCode.PROJECT_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${project.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    project.setState(next);
    if (next === "open") {
      this.activeId = id;
    } else if (this.activeId === id) {
      this.activeId = null;
    }
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  getActive(): Project | undefined {
    return this.activeId ? this.projects.get(this.activeId) : undefined;
  }

  clear(): void {
    this.projects.clear();
    this.activeId = null;
  }
}
