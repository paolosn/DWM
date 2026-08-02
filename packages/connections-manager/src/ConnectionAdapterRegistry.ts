import type { ConnectionType } from "./ConnectionTypes.js";
import type { ConnectionAdapter } from "./adapters/ConnectionAdapter.js";
import { McpStdioConnectionAdapter } from "./adapters/McpStdioConnectionAdapter.js";
import {
  McpRemoteConnectionAdapter,
  type FetchLike,
} from "./adapters/McpRemoteConnectionAdapter.js";
import { WordPressConnectionAdapter } from "./adapters/WordPressConnectionAdapter.js";
import { HttpConnectionAdapter } from "./adapters/HttpConnectionAdapter.js";
import { GitHubConnectionAdapter } from "./adapters/GitHubConnectionAdapter.js";
import { SSHConnectionAdapter, type SSHClientPort } from "./adapters/SSHConnectionAdapter.js";
import { McpProcessSupervisor } from "./adapters/McpProcessSupervisor.js";

export interface ConnectionAdapterRegistryOptions {
  readonly fetchImpl?: FetchLike;
  /** Inyectado por quien compone el Engine; sin él, SSH/SFTP reportan "adaptador no disponible". */
  readonly sshPort?: SSHClientPort;
  readonly mcpProcessSupervisor?: McpProcessSupervisor;
}

/**
 * Registro extensible de adaptadores por tipo de conexión (README
 * "Estructura del módulo"). Para los tipos con conector real mínimo
 * implementado, expone el adaptador correspondiente; para el resto,
 * `get()` devuelve `undefined` — el llamante (`ConnectionTester`) es
 * responsable de reportar `adapter-unavailable`, nunca de fingir un
 * resultado.
 */
export class ConnectionAdapterRegistry {
  private readonly adapters = new Map<ConnectionType, ConnectionAdapter>();
  private readonly extra = new Map<string, ConnectionAdapter>();
  readonly mcpProcessSupervisor: McpProcessSupervisor;

  constructor(options: ConnectionAdapterRegistryOptions = {}) {
    this.mcpProcessSupervisor = options.mcpProcessSupervisor ?? new McpProcessSupervisor();
    this.register(new McpStdioConnectionAdapter(this.mcpProcessSupervisor));
    this.register(new McpRemoteConnectionAdapter(options.fetchImpl));
    this.register(new WordPressConnectionAdapter(options.fetchImpl));
    this.register(new HttpConnectionAdapter(options.fetchImpl));
    this.register(new GitHubConnectionAdapter(options.fetchImpl));
    this.register(new SSHConnectionAdapter(options.sshPort, "ssh"));
    this.register(new SSHConnectionAdapter(options.sshPort, "sftp"));
  }

  /** Registra o sustituye el adaptador de uno o varios tipos (conectores personalizados futuros). */
  register(adapter: ConnectionAdapter): void {
    for (const type of adapter.supportedTypes) {
      this.adapters.set(type, adapter);
    }
    this.extra.set(adapter.adapterId, adapter);
  }

  get(type: ConnectionType): ConnectionAdapter | undefined {
    return this.adapters.get(type);
  }

  getById(adapterId: string): ConnectionAdapter | undefined {
    return this.extra.get(adapterId);
  }

  isAvailable(type: ConnectionType): boolean {
    return this.adapters.has(type);
  }

  async disposeAll(): Promise<void> {
    await this.mcpProcessSupervisor.disposeAll();
  }
}
