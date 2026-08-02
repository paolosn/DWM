import type { ConnectionGrant } from "./ConnectionTypes.js";
import type { ConnectionRepository } from "./ConnectionRepository.js";

/**
 * Autorización de capacidades por conexión (README "Permisos y
 * capacidades"): denegado por defecto. Un agente, herramienta o proceso
 * ("grantee") solo puede ejecutar una capacidad de una conexión concreta
 * si existe un `ConnectionGrant` explícito para ese trío. El agente
 * nunca recibe la credencial: solo se le confirma si está autorizado, y
 * la ejecución real de la capacidad pasa siempre por el manager.
 */
export class ConnectionCapabilityManager {
  constructor(private readonly repository: ConnectionRepository) {}

  async assign(
    projectPath: string,
    connectionId: string,
    granteeId: string,
    capability: string
  ): Promise<void> {
    const grants = await this.repository.readGrants(projectPath);
    const exists = grants.some(
      (g) =>
        g.connectionId === connectionId && g.granteeId === granteeId && g.capability === capability
    );
    if (exists) return;
    const next: ConnectionGrant = {
      connectionId,
      granteeId,
      capability,
      grantedAt: new Date().toISOString(),
    };
    await this.repository.writeGrants(projectPath, [...grants, next]);
  }

  async revoke(
    projectPath: string,
    connectionId: string,
    granteeId: string,
    capability: string
  ): Promise<void> {
    const grants = await this.repository.readGrants(projectPath);
    const next = grants.filter(
      (g) =>
        !(
          g.connectionId === connectionId &&
          g.granteeId === granteeId &&
          g.capability === capability
        )
    );
    await this.repository.writeGrants(projectPath, next);
  }

  async isAuthorized(
    projectPath: string,
    connectionId: string,
    granteeId: string,
    capability: string
  ): Promise<boolean> {
    const grants = await this.repository.readGrants(projectPath);
    return grants.some(
      (g) =>
        g.connectionId === connectionId && g.granteeId === granteeId && g.capability === capability
    );
  }

  async listForConnection(projectPath: string, connectionId: string): Promise<ConnectionGrant[]> {
    const grants = await this.repository.readGrants(projectPath);
    return grants.filter((g) => g.connectionId === connectionId);
  }

  /** Elimina todas las concesiones de una conexión (al archivarla/eliminarla). */
  async clearForConnection(projectPath: string, connectionId: string): Promise<void> {
    const grants = await this.repository.readGrants(projectPath);
    const next = grants.filter((g) => g.connectionId !== connectionId);
    await this.repository.writeGrants(projectPath, next);
  }
}
