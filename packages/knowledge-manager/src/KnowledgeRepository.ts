import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import * as path from "node:path";
import {
  hasKnowledgeExtension,
  toKnowledgeId,
  type KnowledgeItem,
  type KnowledgeMetadata,
  type KnowledgeNode,
} from "./KnowledgeTypes.js";
import {
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "./KnowledgeFrontmatter.js";
import { KnowledgeErrorCode } from "./errors/KnowledgeErrorCode.js";
import { KnowledgeError } from "./errors/KnowledgeError.js";

/**
 * Responsable exclusivo de leer y escribir elementos de conocimiento
 * como lo que realmente son: ficheros individuales, a cualquier
 * profundidad, dentro del recurso `psn-knowledge-global` del Workspace.
 * No mantiene ningún estado propio, no crea una base de datos y no
 * mueve ni reorganiza nada salvo lo explícitamente solicitado (crear,
 * duplicar o eliminar el fichero exacto de un elemento). Archivar y
 * restaurar reescriben únicamente el bloque `dwm:` reservado del
 * frontmatter dentro del propio fichero, nunca lo mueven. Nunca decide
 * por sí mismo qué directorio usar: quien lo invoca (`KnowledgeManager`)
 * es responsable de resolverlo, típicamente a través de
 * `@dwm/psn-adapter`.
 */
export class KnowledgeRepository {
  private pathFor(directory: string, id: string): string {
    const absolute = path.join(directory, ...id.split("/"));
    const resolvedDir = path.resolve(directory);
    const resolvedTarget = path.resolve(absolute);
    if (resolvedTarget !== resolvedDir && !resolvedTarget.startsWith(resolvedDir + path.sep)) {
      throw new KnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_UNSAFE_PATH,
        origin: "path",
        recoverable: true,
        message: `El id "${id}" resuelve fuera del recurso de conocimiento en "${directory}".`,
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
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si el elemento de conocimiento "${id}" existe en "${directory}".`,
      });
    }
  }

  /** Lee un elemento de conocimiento del disco. Devuelve `undefined` si el fichero no existe. */
  async read(directory: string, id: string): Promise<KnowledgeItem | undefined> {
    const filePath = this.pathFor(directory, id);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer el elemento de conocimiento "${id}" en "${filePath}".`,
      });
    }

    const { frontmatter, body, malformed } = splitFrontmatter(raw);
    if (malformed) {
      throw new KnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_INVALID_STRUCTURE,
        origin: "repository",
        recoverable: true,
        message: `El elemento de conocimiento "${id}" tiene un frontmatter mal formado (delimitador de apertura sin cierre).`,
      });
    }

    const managed = parseDwmMetadata(frontmatter);
    const content = joinFrontmatter(removeDwmBlock(frontmatter), body);
    const stat = await this.statOrUndefined(filePath);
    const metadata = this.resolveMetadata(managed, stat);

    return { id, content, metadata };
  }

  /** Escribe (crea o sobrescribe por completo) un elemento de conocimiento en disco, insertando sus metadatos gestionados en el frontmatter. */
  async write(
    directory: string,
    id: string,
    content: string,
    metadata: KnowledgeMetadata
  ): Promise<void> {
    const filePath = this.pathFor(directory, id);
    const { frontmatter, body } = splitFrontmatter(content);
    const withDwm = upsertDwmBlock(frontmatter, metadata);
    const finalContent = joinFrontmatter(withDwm, body);

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, finalContent, "utf-8");
    } catch (err) {
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir el elemento de conocimiento "${id}" en "${filePath}".`,
      });
    }
  }

  async delete(directory: string, id: string): Promise<void> {
    const filePath = this.pathFor(directory, id);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new KnowledgeError({
          code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe ningún elemento de conocimiento "${id}" en "${directory}".`,
        });
      }
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_DELETE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al eliminar el elemento de conocimiento "${id}" en "${filePath}".`,
      });
    }
  }

  /** Lista los identificadores de todos los elementos de conocimiento reconocidos, a cualquier profundidad dentro de `directory`, ordenados. */
  async listIds(directory: string): Promise<string[]> {
    const entries = await this.walk(directory);
    return entries
      .filter((entry) => !entry.isDirectory() && hasKnowledgeExtension(entry.name))
      .map((entry) => toKnowledgeId(path.relative(directory, this.entryPath(entry))))
      .sort();
  }

  /** Construye el árbol de navegación jerárquica completo del recurso de conocimiento (carpetas y ficheros, reconocidos o no). */
  async buildTree(directory: string): Promise<KnowledgeNode[]> {
    let topEntries: Dirent[];
    try {
      topEntries = await fs.readdir(directory, { withFileTypes: true });
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar el contenido de "${directory}".`,
      });
    }

    const nodes: KnowledgeNode[] = [];
    for (const entry of topEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relativePath = entry.name;
      if (entry.isDirectory()) {
        const children = await this.buildSubTree(absolute, relativePath);
        nodes.push({ name: entry.name, relativePath, isDirectory: true, children });
      } else {
        nodes.push({
          name: entry.name,
          relativePath,
          isDirectory: false,
          recognized: hasKnowledgeExtension(entry.name),
        });
      }
    }
    return nodes;
  }

  private async buildSubTree(
    absoluteDir: string,
    relativePrefix: string
  ): Promise<KnowledgeNode[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar el contenido de "${absoluteDir}".`,
      });
    }

    const nodes: KnowledgeNode[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(absoluteDir, entry.name);
      const relativePath = toKnowledgeId(`${relativePrefix}/${entry.name}`);
      if (entry.isDirectory()) {
        const children = await this.buildSubTree(absolute, relativePath);
        nodes.push({ name: entry.name, relativePath, isDirectory: true, children });
      } else {
        nodes.push({
          name: entry.name,
          relativePath,
          isDirectory: false,
          recognized: hasKnowledgeExtension(entry.name),
        });
      }
    }
    return nodes;
  }

  private async walk(directory: string): Promise<Dirent[]> {
    try {
      return (await fs.readdir(directory, { recursive: true, withFileTypes: true })) as Dirent[];
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw KnowledgeError.wrap(err, {
        code: KnowledgeErrorCode.KNOWLEDGE_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar los elementos de conocimiento en "${directory}".`,
      });
    }
  }

  private entryPath(entry: Dirent): string {
    const parentPath =
      (entry as unknown as { parentPath?: string; path?: string }).parentPath ??
      (entry as unknown as { path?: string }).path ??
      "";
    return path.join(parentPath, entry.name);
  }

  /** Fechas del propio fichero, usadas como respaldo cuando el elemento no tiene metadatos gestionados. `undefined` si el fichero tampoco existe. */
  async statFile(
    directory: string,
    id: string
  ): Promise<{ createdAt: string; updatedAt: string } | undefined> {
    const stat = await this.statOrUndefined(this.pathFor(directory, id));
    if (!stat) return undefined;
    return { createdAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString() };
  }

  private resolveMetadata(
    managed: Partial<KnowledgeMetadata> | undefined,
    stat: { birthtime: Date; mtime: Date } | undefined
  ): KnowledgeMetadata {
    const fallbackCreatedAt = (stat?.birthtime ?? new Date()).toISOString();
    const fallbackUpdatedAt = (stat?.mtime ?? new Date()).toISOString();
    const archived = managed?.archived === true;
    return {
      archived,
      createdAt: managed?.createdAt ?? fallbackCreatedAt,
      updatedAt: managed?.updatedAt ?? fallbackUpdatedAt,
      tags: managed?.tags ?? [],
      relations: managed?.relations ?? [],
      ...(archived && managed?.archivedAt ? { archivedAt: managed.archivedAt } : {}),
      ...(managed?.category ? { category: managed.category } : {}),
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
