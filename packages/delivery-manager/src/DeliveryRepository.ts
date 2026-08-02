import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DELIVERY_METADATA_FILE, ENTREGAS_DIR_NAME, type DeliveryRecord } from "./DeliveryTypes.js";
import { DeliveryErrorCode } from "./errors/DeliveryErrorCode.js";
import { DeliveryError } from "./errors/DeliveryError.js";
import { DeliveryValidator } from "./DeliveryValidator.js";

export interface DirectoryDigest {
  readonly hash: string;
  readonly sizeBytes: number;
  readonly fileCount: number;
  readonly directoryCount: number;
}

/**
 * Responsable exclusivo de leer y escribir entregas como lo que
 * realmente son: carpetas físicas dentro de `ENTREGAS/` en la raíz de
 * cada proyecto, cada una con su propio sidecar de metadatos
 * (`.dwm-delivery.json`) gestionado por DWM. Nunca sobrescribe el
 * contenido entregado por el cliente, nunca mueve ni renombra una carpeta
 * de entrega ya existente. No decide por sí mismo el nombre de la
 * carpeta: quien lo invoca (`DeliveryImporter`/`DeliveryManager`) es
 * responsable de derivarlo.
 */
export class DeliveryRepository {
  private readonly validator: DeliveryValidator = new DeliveryValidator();

  entregasDir(projectPath: string): string {
    return path.join(projectPath, ENTREGAS_DIR_NAME);
  }

  /** Ruta absoluta y segura de la carpeta de una entrega, comprobando que no escapa de `ENTREGAS/` vía traversal. */
  deliveryDir(projectPath: string, folderName: string): string {
    const base = this.entregasDir(projectPath);
    const absolute = path.join(base, folderName);
    const resolvedBase = path.resolve(base);
    const resolvedTarget = path.resolve(absolute);
    if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
      throw new DeliveryError({
        code: DeliveryErrorCode.DELIVERY_UNSAFE_PATH,
        origin: "path",
        recoverable: true,
        message: `La carpeta de entrega "${folderName}" resuelve fuera de "${base}".`,
      });
    }
    return absolute;
  }

  async exists(projectPath: string, folderName: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.deliveryDir(projectPath, folderName));
      return stat.isDirectory();
    } catch (err) {
      if (this.isNotFound(err)) return false;
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al comprobar si la entrega "${folderName}" existe en "${projectPath}".`,
      });
    }
  }

  /** Lista los nombres de carpeta de todas las entregas físicamente presentes bajo `ENTREGAS/`, ordenados ascendentemente (el prefijo de fecha las ordena cronológicamente). */
  async listFolderNames(projectPath: string): Promise<string[]> {
    const dir = this.entregasDir(projectPath);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_LIST_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al listar las entregas en "${dir}".`,
      });
    }
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** Lee el sidecar de metadatos de una entrega. Devuelve `undefined` si la carpeta o el sidecar no existen. */
  async readMetadata(projectPath: string, folderName: string): Promise<DeliveryRecord | undefined> {
    const metadataPath = path.join(
      this.deliveryDir(projectPath, folderName),
      DELIVERY_METADATA_FILE
    );
    let raw: string;
    try {
      raw = await fs.readFile(metadataPath, "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al leer los metadatos de la entrega "${folderName}" en "${metadataPath}".`,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_INVALID_STRUCTURE,
        origin: "repository",
        recoverable: true,
        message: `El sidecar de metadatos de la entrega "${folderName}" tiene un JSON mal formado en "${metadataPath}".`,
      });
    }
    this.validator.assertValidRecordStructure(parsed, metadataPath);
    return parsed;
  }

  /** Escribe (crea o sobrescribe por completo) el sidecar de metadatos de una entrega ya presente en disco. Nunca toca el resto del contenido de la carpeta. */
  async writeMetadata(projectPath: string, record: DeliveryRecord): Promise<void> {
    const deliveryDir = this.deliveryDir(projectPath, record.folderName);
    const metadataPath = path.join(deliveryDir, DELIVERY_METADATA_FILE);
    try {
      await fs.writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
    } catch (err) {
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_WRITE_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al escribir los metadatos de la entrega "${record.folderName}" en "${metadataPath}".`,
      });
    }
  }

  /**
   * Calcula un resumen determinista del contenido físico de una carpeta de
   * entrega: tamaño total, número de ficheros y carpetas, y un hash
   * sha256 estable frente al orden del sistema de ficheros (se calcula
   * sobre las rutas relativas y los hashes de cada fichero, ordenados).
   * Excluye siempre el propio sidecar de metadatos del cálculo.
   */
  async computeDigest(deliveryDirAbsolute: string): Promise<DirectoryDigest> {
    const files: { relativePath: string; hash: string; size: number }[] = [];
    let directoryCount = 0;

    const walk = async (currentDir: string, relativeDir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch (err) {
        throw DeliveryError.wrap(err, {
          code: DeliveryErrorCode.DELIVERY_HASH_FAILED,
          origin: "repository",
          recoverable: true,
          message: `Fallo al recorrer la entrega en "${currentDir}" para calcular su hash.`,
        });
      }
      for (const entry of entries) {
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        if (relativeDir === "" && entry.name === DELIVERY_METADATA_FILE) continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          directoryCount += 1;
          await walk(fullPath, relativePath);
        } else if (entry.isFile()) {
          const content = await fs.readFile(fullPath);
          const fileHash = createHash("sha256").update(content).digest("hex");
          files.push({ relativePath, hash: fileHash, size: content.length });
        }
      }
    };

    try {
      await walk(deliveryDirAbsolute, "");
    } catch (err) {
      throw DeliveryError.wrap(err, {
        code: DeliveryErrorCode.DELIVERY_HASH_FAILED,
        origin: "repository",
        recoverable: true,
        message: `Fallo al calcular el hash de la entrega en "${deliveryDirAbsolute}".`,
      });
    }

    files.sort((a, b) =>
      a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0
    );
    const composite = files.map((f) => `${f.relativePath}:${f.hash}:${f.size}`).join("\n");
    const hash = createHash("sha256").update(composite, "utf-8").digest("hex");
    const sizeBytes = files.reduce((sum, f) => sum + f.size, 0);

    return { hash, sizeBytes, fileCount: files.length, directoryCount };
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
