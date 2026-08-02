import { promises as fs } from "node:fs";
import * as path from "node:path";
import type {
  Connection,
  ConnectionGrant,
  ConnectionProfile,
  McpServerDefinition,
} from "./ConnectionTypes.js";
import { ConnectionErrorCode } from "./errors/ConnectionErrorCode.js";
import { ConnectionError } from "./errors/ConnectionError.js";

const CONNECTIONS_DIR_NAME = path.join(".kilo", "connections");
const CONNECTIONS_FILE = "connections.json";
const PROFILES_FILE = "profiles.json";
const MCP_SERVERS_FILE = "mcp-servers.json";
const GRANTS_FILE = "grants.json";

/**
 * Persistencia portable y versionable de conexiones, perfiles y
 * servidores MCP, siempre bajo `<projectPath>/.kilo/connections/`
 * (README "Proyecto y .kilo"): las conexiones pertenecen al proyecto, no
 * al cliente ni al Workspace global. Cada fichero solo contiene
 * configuración segura y referencias a Secrets (`SecretReferences`);
 * nunca un valor de secreto en claro. No usa base de datos.
 */
export class ConnectionRepository {
  private dir(projectPath: string): string {
    return path.join(projectPath, CONNECTIONS_DIR_NAME);
  }

  private async readJsonArray<T>(filePath: string): Promise<T[]> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw ConnectionError.wrap(err, {
        code: ConnectionErrorCode.CONNECTION_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer "${filePath}".`,
      });
    }
  }

  private async writeJsonArray<T>(filePath: string, items: readonly T[]): Promise<void> {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(items, null, 2), "utf-8");
    } catch (err) {
      throw ConnectionError.wrap(err, {
        code: ConnectionErrorCode.CONNECTION_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir "${filePath}".`,
      });
    }
  }

  private isNotFound(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "ENOENT"
    );
  }

  // -- Connections ---------------------------------------------------

  async readConnections(projectPath: string): Promise<Connection[]> {
    return this.readJsonArray<Connection>(path.join(this.dir(projectPath), CONNECTIONS_FILE));
  }

  async writeConnections(projectPath: string, connections: readonly Connection[]): Promise<void> {
    await this.writeJsonArray(path.join(this.dir(projectPath), CONNECTIONS_FILE), connections);
  }

  // -- Profiles ---------------------------------------------------

  async readProfiles(projectPath: string): Promise<ConnectionProfile[]> {
    return this.readJsonArray<ConnectionProfile>(path.join(this.dir(projectPath), PROFILES_FILE));
  }

  async writeProfiles(projectPath: string, profiles: readonly ConnectionProfile[]): Promise<void> {
    await this.writeJsonArray(path.join(this.dir(projectPath), PROFILES_FILE), profiles);
  }

  // -- MCP servers ---------------------------------------------------

  async readMcpServers(projectPath: string): Promise<McpServerDefinition[]> {
    return this.readJsonArray<McpServerDefinition>(
      path.join(this.dir(projectPath), MCP_SERVERS_FILE)
    );
  }

  async writeMcpServers(
    projectPath: string,
    servers: readonly McpServerDefinition[]
  ): Promise<void> {
    await this.writeJsonArray(path.join(this.dir(projectPath), MCP_SERVERS_FILE), servers);
  }

  // -- Capability grants ---------------------------------------------------

  async readGrants(projectPath: string): Promise<ConnectionGrant[]> {
    return this.readJsonArray<ConnectionGrant>(path.join(this.dir(projectPath), GRANTS_FILE));
  }

  async writeGrants(projectPath: string, grants: readonly ConnectionGrant[]): Promise<void> {
    await this.writeJsonArray(path.join(this.dir(projectPath), GRANTS_FILE), grants);
  }
}
