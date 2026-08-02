import { promises as fs } from "node:fs";
import * as path from "node:path";
import { RULE_FILE_EXTENSION, type Rule, type RuleMetadata } from "./RuleTypes.js";
import {
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "./RuleFrontmatter.js";
import { RuleErrorCode } from "./errors/RuleErrorCode.js";
import { RuleError } from "./errors/RuleError.js";

/**
 * Responsable exclusivo de leer y escribir reglas como lo que realmente
 * son: ficheros Markdown individuales dentro del recurso `rules` del
 * Workspace. No mantiene ningún estado propio, no crea una base de
 * datos y no mueve ni renombra ficheros —archivar/restaurar se hace
 * reescribiendo el bloque `dwm:` reservado del frontmatter dentro del
 * propio fichero, nunca moviéndolo—. Nunca decide por sí mismo qué
 * directorio usar: quien lo invoca (`RuleManager`) es responsable de
 * resolverlo, típicamente a través de `@dwm/psn-adapter`.
 */
export class RuleRepository {
  private fileNameFor(id: string): string {
    return `${id}${RULE_FILE_EXTENSION}`;
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
      throw RuleError.wrap(err, {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si la regla "${id}" existe en "${directory}".`,
      });
    }
  }

  /** Lee una regla del disco. Devuelve `undefined` si el fichero no existe. */
  async read(directory: string, id: string): Promise<Rule | undefined> {
    const filePath = this.pathFor(directory, id);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw RuleError.wrap(err, {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer la regla "${id}" en "${filePath}".`,
      });
    }

    const { frontmatter, body, malformed } = splitFrontmatter(raw);
    if (malformed) {
      throw new RuleError({
        code: RuleErrorCode.RULE_INVALID_STRUCTURE,
        origin: "repository",
        recoverable: true,
        message: `La regla "${id}" tiene un frontmatter mal formado (delimitador de apertura sin cierre).`,
      });
    }

    const managed = parseDwmMetadata(frontmatter);
    const content = joinFrontmatter(removeDwmBlock(frontmatter), body);
    const stat = await this.statOrUndefined(filePath);
    const metadata = this.resolveMetadata(managed, stat);

    return { id, content, metadata };
  }

  /** Escribe (crea o sobrescribe por completo) una regla en disco, insertando sus metadatos gestionados en el frontmatter. */
  async write(
    directory: string,
    id: string,
    content: string,
    metadata: RuleMetadata
  ): Promise<void> {
    const filePath = this.pathFor(directory, id);
    const { frontmatter, body } = splitFrontmatter(content);
    const withDwm = upsertDwmBlock(frontmatter, metadata);
    const finalContent = joinFrontmatter(withDwm, body);

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(filePath, finalContent, "utf-8");
    } catch (err) {
      throw RuleError.wrap(err, {
        code: RuleErrorCode.RULE_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir la regla "${id}" en "${filePath}".`,
      });
    }
  }

  async delete(directory: string, id: string): Promise<void> {
    const filePath = this.pathFor(directory, id);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new RuleError({
          code: RuleErrorCode.RULE_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe ninguna regla "${id}" en "${directory}".`,
        });
      }
      throw RuleError.wrap(err, {
        code: RuleErrorCode.RULE_DELETE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al eliminar la regla "${id}" en "${filePath}".`,
      });
    }
  }

  /** Lista los identificadores de todas las reglas presentes físicamente en `directory` (ficheros de primer nivel con la extensión de regla), ordenados. */
  async listIds(directory: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(directory);
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw RuleError.wrap(err, {
        code: RuleErrorCode.RULE_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar las reglas en "${directory}".`,
      });
    }
    return entries
      .filter((name) => name.endsWith(RULE_FILE_EXTENSION))
      .map((name) => name.slice(0, -RULE_FILE_EXTENSION.length))
      .sort();
  }

  private resolveMetadata(
    managed: Partial<RuleMetadata> | undefined,
    stat: { birthtime: Date; mtime: Date } | undefined
  ): RuleMetadata {
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
