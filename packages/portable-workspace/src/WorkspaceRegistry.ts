import type { WorkspaceMetadata } from "./WorkspaceMetadata.js";
import { WorkspaceErrorCode } from "./errors/WorkspaceErrorCode.js";
import { createWorkspaceError } from "./errors/WorkspaceError.js";

export interface WorkspaceRegistryEntry {
  readonly root: string;
  readonly metadata: WorkspaceMetadata;
  readonly registeredAt: string;
}

/**
 * Mantiene, únicamente en memoria durante la sesión, el conjunto de
 * raíces de Workspace portable conocidas y cuál de ellas está activa. No
 * persiste nada: la raíz activa se recalcula en cada arranque mediante
 * `WorkspaceLocator`.
 */
export class WorkspaceRegistry {
  private readonly entries = new Map<string, WorkspaceRegistryEntry>();
  private activeId: string | undefined = undefined;

  register(metadata: WorkspaceMetadata, root: string): void {
    if (this.entries.has(metadata.id)) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.PWORKSPACE_ALREADY_REGISTERED,
        message: `Ya existe un Workspace portable registrado con id "${metadata.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.entries.set(metadata.id, { root, metadata, registeredAt: new Date().toISOString() });
  }

  get(id: string): WorkspaceRegistryEntry | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  require(id: string): WorkspaceRegistryEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      throw createWorkspaceError({
        code: WorkspaceErrorCode.PWORKSPACE_NOT_FOUND,
        message: `No existe ningún Workspace portable registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return entry;
  }

  list(): string[] {
    return [...this.entries.keys()].sort();
  }

  setActive(id: string): void {
    this.require(id);
    this.activeId = id;
  }

  getActive(): WorkspaceRegistryEntry | undefined {
    return this.activeId ? this.entries.get(this.activeId) : undefined;
  }

  unregister(id: string): void {
    this.entries.delete(id);
    if (this.activeId === id) this.activeId = undefined;
  }

  clear(): void {
    this.entries.clear();
    this.activeId = undefined;
  }
}
