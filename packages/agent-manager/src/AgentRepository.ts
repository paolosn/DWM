import { promises as fs } from "node:fs";
import * as path from "node:path";
import { AGENT_FILE_EXTENSION, type Agent, type AgentMetadata } from "./AgentTypes.js";
import {
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "./AgentFrontmatter.js";
import { AgentErrorCode } from "./errors/AgentErrorCode.js";
import { AgentError } from "./errors/AgentError.js";

/**
 * Responsable exclusivo de leer y escribir agentes como lo que
 * realmente son: ficheros Markdown individuales dentro del recurso
 * `agents` del Workspace, compatibles con el formato real de Kilo Code
 * y del PSN-BASE original (`description`/`mode`/`color` en frontmatter
 * más un encabezado `# Nombre`). No mantiene ningún estado propio, no
 * crea una base de datos y no mueve ni renombra ficheros —archivar y
 * restaurar se hace reescribiendo el bloque `dwm:` reservado del
 * frontmatter dentro del propio fichero, nunca moviéndolo—. Nunca
 * decide por sí mismo qué directorio usar: quien lo invoca
 * (`AgentManager`) es responsable de resolverlo, típicamente a través
 * de `@dwm/psn-adapter`.
 */
export class AgentRepository {
  private fileNameFor(id: string): string {
    return `${id}${AGENT_FILE_EXTENSION}`;
  }

  private pathFor(directory: string, id: string): string {
    return path.join(directory, this.fileNameFor(id));
  }

  async exists(directory: string, id: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(directory, id));
      return true;
    } catch (err) {
      if (this.isNotFound(err)) return false;
      throw AgentError.wrap(err, {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si el agente "${id}" existe en "${directory}".`,
      });
    }
  }

  /** Lee un agente del disco. Devuelve `undefined` si el fichero no existe. */
  async read(directory: string, id: string): Promise<Agent | undefined> {
    const filePath = this.pathFor(directory, id);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw AgentError.wrap(err, {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer el agente "${id}" en "${filePath}".`,
      });
    }

    const { frontmatter, body, malformed } = splitFrontmatter(raw);
    if (malformed) {
      throw new AgentError({
        code: AgentErrorCode.AGENT_INVALID_STRUCTURE,
        origin: "repository",
        recoverable: true,
        message: `El agente "${id}" tiene un frontmatter mal formado (delimitador de apertura sin cierre).`,
      });
    }

    const managed = parseDwmMetadata(frontmatter);
    const content = joinFrontmatter(removeDwmBlock(frontmatter), body);
    const stat = await this.statOrUndefined(filePath);
    const metadata = this.resolveMetadata(managed, stat);

    return { id, content, metadata };
  }

  /** Escribe (crea o sobrescribe por completo) un agente en disco, insertando sus metadatos gestionados en el frontmatter. */
  async write(
    directory: string,
    id: string,
    content: string,
    metadata: AgentMetadata
  ): Promise<void> {
    const filePath = this.pathFor(directory, id);
    const { frontmatter, body } = splitFrontmatter(content);
    const withDwm = upsertDwmBlock(frontmatter, metadata);
    const finalContent = joinFrontmatter(withDwm, body);

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(filePath, finalContent, "utf-8");
    } catch (err) {
      throw AgentError.wrap(err, {
        code: AgentErrorCode.AGENT_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir el agente "${id}" en "${filePath}".`,
      });
    }
  }

  async delete(directory: string, id: string): Promise<void> {
    const filePath = this.pathFor(directory, id);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new AgentError({
          code: AgentErrorCode.AGENT_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe ningún agente "${id}" en "${directory}".`,
        });
      }
      throw AgentError.wrap(err, {
        code: AgentErrorCode.AGENT_DELETE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al eliminar el agente "${id}" en "${filePath}".`,
      });
    }
  }

  /** Lista los identificadores de todos los agentes presentes físicamente en `directory` (ficheros de primer nivel con la extensión de agente), ordenados. */
  async listIds(directory: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw AgentError.wrap(err, {
        code: AgentErrorCode.AGENT_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar los agentes en "${directory}".`,
      });
    }
    return entries
      .filter((name) => name.endsWith(AGENT_FILE_EXTENSION))
      .map((name) => name.slice(0, -AGENT_FILE_EXTENSION.length))
      .sort();
  }

  private resolveMetadata(
    managed: Partial<AgentMetadata> | undefined,
    stat: { birthtime: Date; mtime: Date } | undefined
  ): AgentMetadata {
    const fallbackCreatedAt = (stat?.birthtime ?? new Date()).toISOString();
    const fallbackUpdatedAt = (stat?.mtime ?? new Date()).toISOString();
    const archived = managed?.archived === true;
    return {
      archived,
      createdAt: managed?.createdAt ?? fallbackCreatedAt,
      updatedAt: managed?.updatedAt ?? fallbackUpdatedAt,
      ...(archived && managed?.archivedAt ? { archivedAt: managed.archivedAt } : {}),
    };
  }

  private async statOrUndefined(
    filePath: string
  ): Promise<{ birthtime: Date; mtime: Date } | undefined> {
    try {
      return await fs.stat(filePath);
    } catch {
      return undefined;
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
}
