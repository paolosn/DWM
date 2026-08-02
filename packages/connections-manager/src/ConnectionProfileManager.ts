import { randomUUID } from "node:crypto";
import type { ConnectionProfile } from "./ConnectionTypes.js";
import { isSafeName } from "./ConnectionTypes.js";
import type { ConnectionRepository } from "./ConnectionRepository.js";
import { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";
import { createConnectionError } from "./errors/ConnectionError.js";

/**
 * Perfiles de conexión por proyecto (README "Perfiles de conexión"):
 * Producción, Desarrollo, Staging, Local... Cada perfil agrupa
 * conexiones concretas. Cambiar de perfil activo no modifica ni mezcla
 * credenciales — solo cambia qué grupo de conexiones se considera
 * "activo" para el proyecto; las conexiones en sí no se tocan.
 */
export class ConnectionProfileManager {
  constructor(private readonly repository: ConnectionRepository) {}

  async list(projectPath: string): Promise<ConnectionProfile[]> {
    return this.repository.readProfiles(projectPath);
  }

  async get(projectPath: string, id: string): Promise<ConnectionProfile | undefined> {
    const profiles = await this.repository.readProfiles(projectPath);
    return profiles.find((p) => p.id === id);
  }

  async getActive(projectPath: string): Promise<ConnectionProfile | undefined> {
    const profiles = await this.repository.readProfiles(projectPath);
    return profiles.find((p) => p.status === "active");
  }

  async create(
    projectPath: string,
    projectId: string,
    name: string,
    connectionIds: readonly string[] = []
  ): Promise<ConnectionProfile> {
    if (!isSafeName(name)) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_INVALID_NAME,
        message: "El nombre del perfil no es válido.",
        origin: "name",
        recoverable: true,
      });
    }
    const profiles = await this.repository.readProfiles(projectPath);
    if (profiles.some((p) => p.name === name && p.status !== "archived")) {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_PROFILE_ALREADY_EXISTS,
        message: `Ya existe un perfil activo con el nombre "${name}" en este proyecto.`,
        origin: "profile",
        recoverable: true,
      });
    }
    const now = new Date().toISOString();
    const profile: ConnectionProfile = {
      id: randomUUID(),
      projectId,
      name,
      status: "inactive",
      connectionIds,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.writeProfiles(projectPath, [...profiles, profile]);
    return profile;
  }

  async update(
    projectPath: string,
    id: string,
    changes: { name?: string; connectionIds?: readonly string[] }
  ): Promise<ConnectionProfile> {
    const profiles = await this.repository.readProfiles(projectPath);
    const index = profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      throw this.notFound(id);
    }
    const existing = profiles[index]!;
    const updated: ConnectionProfile = {
      ...existing,
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.connectionIds !== undefined ? { connectionIds: changes.connectionIds } : {}),
      updatedAt: new Date().toISOString(),
    };
    const next = [...profiles];
    next[index] = updated;
    await this.repository.writeProfiles(projectPath, next);
    return updated;
  }

  /** Activa un perfil; cualquier otro perfil `active` pasa a `inactive` (solo uno activo a la vez). */
  async activate(projectPath: string, id: string): Promise<ConnectionProfile> {
    const profiles = await this.repository.readProfiles(projectPath);
    const target = profiles.find((p) => p.id === id);
    if (!target) throw this.notFound(id);
    const now = new Date().toISOString();
    const next = profiles.map((p) => {
      if (p.id === id) return { ...p, status: "active" as const, updatedAt: now };
      if (p.status === "active") return { ...p, status: "inactive" as const, updatedAt: now };
      return p;
    });
    await this.repository.writeProfiles(projectPath, next);
    return next.find((p) => p.id === id)!;
  }

  async duplicate(projectPath: string, id: string, newName: string): Promise<ConnectionProfile> {
    const source = await this.get(projectPath, id);
    if (!source) throw this.notFound(id);
    return this.create(projectPath, source.projectId, newName, source.connectionIds);
  }

  async archive(projectPath: string, id: string): Promise<ConnectionProfile> {
    const profiles = await this.repository.readProfiles(projectPath);
    const index = profiles.findIndex((p) => p.id === id);
    if (index === -1) throw this.notFound(id);
    const updated: ConnectionProfile = {
      ...profiles[index]!,
      status: "archived",
      updatedAt: new Date().toISOString(),
    };
    const next = [...profiles];
    next[index] = updated;
    await this.repository.writeProfiles(projectPath, next);
    return updated;
  }

  /** Solo elimina si el perfil no está activo (borrado seguro; README "crear/activar/... eliminar perfil cuando sea seguro"). */
  async delete(projectPath: string, id: string): Promise<void> {
    const profiles = await this.repository.readProfiles(projectPath);
    const target = profiles.find((p) => p.id === id);
    if (!target) throw this.notFound(id);
    if (target.status === "active") {
      throw createConnectionError({
        code: ConnectionErrorCode.CONNECTION_PROFILE_IN_USE,
        message: "No se puede eliminar el perfil activo; actívese otro perfil primero.",
        origin: "profile",
        recoverable: true,
      });
    }
    await this.repository.writeProfiles(
      projectPath,
      profiles.filter((p) => p.id !== id)
    );
  }

  private notFound(id: string) {
    return createConnectionError({
      code: ConnectionErrorCode.CONNECTION_PROFILE_NOT_FOUND,
      message: `No existe ningún perfil de conexión con id "${id}".`,
      origin: "profile",
      recoverable: true,
    });
  }
}
