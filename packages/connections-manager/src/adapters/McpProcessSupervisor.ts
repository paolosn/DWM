import { McpStdioSession, type McpStdioProcessOptions } from "./McpStdioSession.js";

/**
 * Registro de sesiones stdio de MCP activas, indexadas por `connectionId`.
 * Garantiza que ningún proceso quede huérfano: `disposeAll()` se invoca
 * siempre al apagar DWM (`ConnectionsManager.dispose()`), y `dispose(id)`
 * al desactivar/archivar/eliminar una conexión concreta.
 */
export class McpProcessSupervisor {
  private readonly sessions = new Map<string, McpStdioSession>();

  getOrCreate(connectionId: string, options: McpStdioProcessOptions): McpStdioSession {
    const existing = this.sessions.get(connectionId);
    if (existing && existing.isRunning) return existing;
    const session = new McpStdioSession(options);
    session.start();
    this.sessions.set(connectionId, session);
    return session;
  }

  async dispose(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    session.kill();
    this.sessions.delete(connectionId);
  }

  async disposeAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.dispose(id);
    }
  }

  get activeCount(): number {
    return this.sessions.size;
  }
}
