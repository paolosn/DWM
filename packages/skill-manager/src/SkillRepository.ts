import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  SKILL_FILE_NAME,
  type Skill,
  type SkillAuxFile,
  type SkillFileStatus,
  type SkillMetadata,
} from "./SkillTypes.js";
import {
  joinFrontmatter,
  parseDwmMetadata,
  removeDwmBlock,
  splitFrontmatter,
  upsertDwmBlock,
} from "./SkillFrontmatter.js";
import { SkillErrorCode } from "./errors/SkillErrorCode.js";
import { SkillError } from "./errors/SkillError.js";

/**
 * Responsable exclusivo de leer y escribir skills como lo que realmente
 * son: carpetas dentro del recurso `skills` del Workspace, cada una con
 * su `SKILL.md` como fuente principal y, opcionalmente, archivos y
 * subcarpetas auxiliares (incluidos ocultos). No mantiene ningún estado
 * propio, no crea una base de datos, y no mueve ni reorganiza nada salvo
 * lo explícitamente solicitado (crear, duplicar o eliminar la carpeta
 * exacta de una skill). Archivar/restaurar reescribe únicamente el
 * bloque `dwm:` del frontmatter de `SKILL.md`, nunca mueve la carpeta.
 */
export class SkillRepository {
  private skillDir(directory: string, id: string): string {
    return path.join(directory, id);
  }

  private skillFilePath(directory: string, id: string): string {
    return path.join(this.skillDir(directory, id), SKILL_FILE_NAME);
  }

  async exists(directory: string, id: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.skillDir(directory, id));
      return stat.isDirectory();
    } catch (err) {
      if (this.isNotFound(err)) return false;
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si la skill "${id}" existe en "${directory}".`,
      });
    }
  }

  async existsSkillFile(directory: string, id: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.skillFilePath(directory, id));
      return stat.isFile();
    } catch (err) {
      if (this.isNotFound(err)) return false;
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar "${SKILL_FILE_NAME}" de la skill "${id}" en "${directory}".`,
      });
    }
  }

  /** Detecta, sin lanzar, si `SKILL.md` está presente y bien formado (`"ok"`), ausente (`"missing"`) o inválido (`"invalid"`). */
  async inspectSkillFile(directory: string, id: string): Promise<SkillFileStatus> {
    let raw: string;
    try {
      raw = await fs.readFile(this.skillFilePath(directory, id), "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return "missing";
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer "${SKILL_FILE_NAME}" de la skill "${id}".`,
      });
    }
    return splitFrontmatter(raw).malformed ? "invalid" : "ok";
  }

  /** Lee una skill del disco. Devuelve `undefined` si su carpeta no existe en absoluto. */
  async read(directory: string, id: string): Promise<Skill | undefined> {
    if (!(await this.exists(directory, id))) return undefined;

    const filePath = this.skillFilePath(directory, id);
    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new SkillError({
          code: SkillErrorCode.SKILL_FILE_MISSING,
          origin: "repository",
          recoverable: true,
          message: `La skill "${id}" existe pero no tiene "${SKILL_FILE_NAME}" en "${directory}".`,
        });
      }
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer "${SKILL_FILE_NAME}" de la skill "${id}" en "${filePath}".`,
      });
    }

    const { frontmatter, body, malformed } = splitFrontmatter(raw);
    if (malformed) {
      throw new SkillError({
        code: SkillErrorCode.SKILL_FILE_INVALID,
        origin: "repository",
        recoverable: true,
        message: `"${SKILL_FILE_NAME}" de la skill "${id}" tiene un frontmatter mal formado (delimitador de apertura sin cierre).`,
      });
    }

    const managed = parseDwmMetadata(frontmatter);
    const withoutDwm = joinFrontmatter(removeDwmBlock(frontmatter), body);
    const stat = await this.statOrUndefined(filePath);
    const metadata = this.resolveMetadata(managed, stat);

    return { id, content: withoutDwm, metadata };
  }

  /** Escribe (crea o sobrescribe) el `SKILL.md` de una skill, insertando sus metadatos gestionados en el frontmatter. */
  async write(
    directory: string,
    id: string,
    content: string,
    metadata: SkillMetadata
  ): Promise<void> {
    const dir = this.skillDir(directory, id);
    const filePath = this.skillFilePath(directory, id);
    const { frontmatter, body } = splitFrontmatter(content);
    const withDwm = upsertDwmBlock(frontmatter, metadata);
    const finalContent = joinFrontmatter(withDwm, body);

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, finalContent, "utf-8");
    } catch (err) {
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir "${SKILL_FILE_NAME}" de la skill "${id}" en "${filePath}".`,
      });
    }
  }

  /** Lista los ficheros y carpetas auxiliares dentro de la carpeta de una skill, excluyendo `SKILL.md` (incluye ocultos). */
  async listAuxFiles(directory: string, id: string): Promise<SkillAuxFile[]> {
    const dir = this.skillDir(directory, id);
    let entries: Array<{ name: string; parentPath: string; isDirectory(): boolean }>;
    try {
      entries = (await fs.readdir(dir, {
        recursive: true,
        withFileTypes: true,
      })) as unknown as Array<{
        name: string;
        parentPath: string;
        isDirectory(): boolean;
      }>;
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar los archivos auxiliares de la skill "${id}" en "${dir}".`,
      });
    }

    const result: SkillAuxFile[] = [];
    for (const entry of entries) {
      const absolute = path.join(entry.parentPath, entry.name);
      const relativePath = path.relative(dir, absolute).split(path.sep).join("/");
      if (relativePath === SKILL_FILE_NAME) continue;
      const isDirectory = entry.isDirectory();
      if (isDirectory) {
        result.push({ relativePath, isDirectory: true });
      } else {
        const stat = await this.statOrUndefined(absolute);
        result.push({
          relativePath,
          isDirectory: false,
          ...(stat ? { size: (stat as unknown as { size: number }).size } : {}),
        });
      }
    }
    return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  /** Lee el contenido de un archivo auxiliar concreto (nunca `SKILL.md`), dada una ruta relativa ya validada como segura. */
  async readAuxFile(directory: string, id: string, relativePath: string): Promise<string> {
    const dir = this.skillDir(directory, id);
    const absolute = path.join(dir, relativePath);
    const resolvedDir = path.resolve(dir);
    const resolvedTarget = path.resolve(absolute);
    if (resolvedTarget !== resolvedDir && !resolvedTarget.startsWith(resolvedDir + path.sep)) {
      throw new SkillError({
        code: SkillErrorCode.SKILL_UNSAFE_PATH,
        origin: "path",
        recoverable: true,
        message: `La ruta "${relativePath}" queda fuera de la carpeta de la skill "${id}".`,
      });
    }
    try {
      return await fs.readFile(absolute, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new SkillError({
          code: SkillErrorCode.SKILL_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe el archivo auxiliar "${relativePath}" en la skill "${id}".`,
        });
      }
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer el archivo auxiliar "${relativePath}" de la skill "${id}".`,
      });
    }
  }

  /** Copia la carpeta completa de una skill (incluidos `SKILL.md`, subcarpetas, plantillas y recursos ocultos) a un nuevo id. */
  async copyTree(directory: string, sourceId: string, destId: string): Promise<void> {
    const source = this.skillDir(directory, sourceId);
    const dest = this.skillDir(directory, destId);
    try {
      await fs.cp(source, dest, { recursive: true, errorOnExist: true, force: false });
    } catch (err) {
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_COPY_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al duplicar la skill "${sourceId}" en "${destId}".`,
      });
    }
  }

  /** Elimina por completo la carpeta exacta de una skill; nunca toca nada fuera de ella. */
  async removeTree(directory: string, id: string): Promise<void> {
    const dir = this.skillDir(directory, id);
    try {
      await fs.rm(dir, { recursive: true, force: false });
    } catch (err) {
      if (this.isNotFound(err)) {
        throw new SkillError({
          code: SkillErrorCode.SKILL_NOT_FOUND,
          origin: "repository",
          recoverable: true,
          message: `No existe ninguna skill "${id}" en "${directory}".`,
        });
      }
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_DELETE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al eliminar la skill "${id}" en "${dir}".`,
      });
    }
  }

  /** Lista los identificadores de todas las skills presentes físicamente en `directory` (subcarpetas de primer nivel), ordenados. */
  async listIds(directory: string): Promise<string[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw SkillError.wrap(err, {
        code: SkillErrorCode.SKILL_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar las skills en "${directory}".`,
      });
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** Fechas de la propia carpeta de la skill, usadas como respaldo cuando `SKILL.md` está ausente o es inválido. `undefined` si la carpeta tampoco existe. */
  async statSkillDir(
    directory: string,
    id: string
  ): Promise<{ createdAt: string; updatedAt: string } | undefined> {
    const stat = await this.statOrUndefined(this.skillDir(directory, id));
    if (!stat) return undefined;
    return { createdAt: stat.birthtime.toISOString(), updatedAt: stat.mtime.toISOString() };
  }

  private resolveMetadata(
    managed: Partial<SkillMetadata> | undefined,
    stat: { birthtime: Date; mtime: Date } | undefined
  ): SkillMetadata {
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
