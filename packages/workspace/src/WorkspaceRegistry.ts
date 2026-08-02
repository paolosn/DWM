import type { Workspace } from "./Workspace.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

/** Mantiene el conjunto de workspaces abiertos simultáneamente y cuál está activo. */
export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, Workspace>();
  private activeId: string | null = null;

  register(workspace: Workspace): void {
    if (this.workspaces.has(workspace.id)) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_ALREADY_OPEN,
        message: `Ya existe un workspace abierto con id "${workspace.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.workspaces.set(workspace.id, workspace);
    if (this.activeId === null) this.activeId = workspace.id;
  }

  unregister(id: string): void {
    this.workspaces.delete(id);
    if (this.activeId === id) {
      const next = this.workspaces.keys().next();
      this.activeId = next.done ? null : next.value;
    }
  }

  get(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  list(): readonly Workspace[] {
    return [...this.workspaces.values()];
  }

  setActive(id: string): void {
    if (!this.workspaces.has(id)) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.WORKSPACE_NOT_FOUND,
        message: `No existe ningún workspace abierto con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.activeId = id;
  }

  getActive(): Workspace | undefined {
    return this.activeId ? this.workspaces.get(this.activeId) : undefined;
  }

  clear(): void {
    this.workspaces.clear();
    this.activeId = null;
  }
}
