import { promises as fs } from "node:fs";
import * as path from "node:path";
import { CLIENT_FILE_EXTENSION, type Client } from "./ClientTypes.js";
import { ClientErrorCode } from "./errors/ClientErrorCode.js";
import { ClientError } from "./errors/ClientError.js";

/**
 * Responsable exclusivo de leer y escribir clientes como lo que
 * realmente son: ficheros JSON individuales dentro del recurso
 * `clientes` del Workspace. No mantiene ningún estado propio, no crea
 * una base de datos y no mueve ni renombra ningún fichero — archivar y
 * restaurar reescriben el propio JSON (su bloque `dwm`), nunca lo
 * mueven. Nunca decide por sí mismo qué directorio usar: quien lo
 * invoca (`ClientManager`) es responsable de resolverlo, típicamente a
 * través de `@dwm/psn-adapter`.
 */
export class ClientRepository {
  private fileNameFor(id: string): string {
    return `${id}${CLIENT_FILE_EXTENSION}`;
  }

  private pathFor(directory: string, id: string): string {
    const absolute = path.join(directory, this.fileNameFor(id));
    const resolvedDir = path.resolve(directory);
    const resolvedTarget = path.resolve(absolute);
    if (resolvedTarget !== resolvedDir && !resolvedTarget.startsWith(resolvedDir + path.sep)) {
      throw new ClientError({
        code: ClientErrorCode.CLIENT_UNSAFE_PATH,
        origin: "path",
        recoverable: true,
        message: `El id "${id}" resuelve fuera del recurso de clientes en "${directory}".`,
      });
    }
    return absolute;
  }

  async exists(directory: string, id: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.pathFor(directory, id));
      return stat.isFile();
    } catch (err) {
      if (this.isNotFound(err)) return false;
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si el cliente "${id}" existe en "${directory}".`,
      });
    }
  }

  /** Lee un cliente del disco. Devuelve `undefined` si el fichero no existe. */
  async read(directory: string, id: string): Promise<Client | undefined> {
    const filePath = this.pathFor(directory, id);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer el cliente "${id}" en "${filePath}".`,
      });
    }

    try {
      const parsed = JSON.parse(raw) as Client;
      return { ...parsed, id };
    } catch (err) {
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_INVALID_STRUCTURE,
        origin: "repository",
        recoverable: true,
        message: `El cliente "${id}" tiene un JSON mal formado en "${filePath}".`,
      });
    }
  }

  /** Escribe (crea o sobrescribe por completo) un cliente en disco como JSON. */
  async write(directory: string, client: Client): Promise<void> {
    const filePath = this.pathFor(directory, client.id);
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(client, null, 2)}\n`, "utf-8");
    } catch (err) {
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir el cliente "${client.id}" en "${filePath}".`,
      });
    }
  }

  async delete(directory: string, id: string): Promise<void> {
    const filePath = this.pathFor(directory, id);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new ClientError({
          code: ClientErrorCode.CLIENT_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe ningún cliente "${id}" en "${directory}".`,
        });
      }
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_DELETE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al eliminar el cliente "${id}" en "${filePath}".`,
      });
    }
  }

  /** Lista los identificadores de todos los clientes presentes físicamente en `directory` (ficheros de primer nivel con la extensión de cliente), ordenados. */
  async listIds(directory: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw ClientError.wrap(err, {
        code: ClientErrorCode.CLIENT_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar los clientes en "${directory}".`,
      });
    }
    return entries
      .filter((name) => name.endsWith(CLIENT_FILE_EXTENSION))
      .map((name) => name.slice(0, -CLIENT_FILE_EXTENSION.length))
      .sort();
  }

  /** Fechas del propio fichero, usadas como respaldo cuando el cliente no tiene metadatos gestionados legibles. `undefined` si el fichero tampoco existe. */
  async statFile(
    directory: string,
    id: string
  ): Promise<{ createdAt: string; updatedAt: string } | undefined> {
    try {
      const stat = await fs.stat(this.pathFor(directory, id));
      return { createdAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString() };
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
