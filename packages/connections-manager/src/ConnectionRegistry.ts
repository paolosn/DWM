import type { Connection } from "./ConnectionTypes.js";

/**
 * Índice en memoria de conexiones ya cargadas desde disco, indexado por
 * `projectPath` (README "Estructura del módulo"). Es un caché de lectura
 * bajo el control exclusivo de `ConnectionsManager`: nunca decide por sí
 * mismo qué persistir; `ConnectionRepository` sigue siendo la única
 * fuente de verdad en disco. Se invalida por proyecto tras cada
 * escritura, para que dos proyectos del mismo cliente jamás compartan
 * estado en memoria.
 */
export class ConnectionRegistry {
  private readonly byProject = new Map<string, Connection[]>();

  set(projectPath: string, connections: readonly Connection[]): void {
    this.byProject.set(projectPath, [...connections]);
  }

  get(projectPath: string): Connection[] | undefined {
    const entries = this.byProject.get(projectPath);
    return entries ? [...entries] : undefined;
  }

  invalidate(projectPath: string): void {
    this.byProject.delete(projectPath);
  }

  clear(): void {
    this.byProject.clear();
  }
}
