import { promises as fs } from "node:fs";
import * as path from "node:path";
import { LoggerErrorCode } from "../errors/LoggerErrorCode.js";
import { LoggerError } from "../errors/LoggerError.js";

export interface RotatingFileWriterOptions {
  readonly filePath: string;
  /** Tamaño máximo del fichero, en bytes, antes de rotarlo. Por defecto: 5 MiB. */
  readonly maxBytes?: number;
  /** Número máximo de ficheros rotados a conservar. Por defecto: 5. */
  readonly maxFiles?: number;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

/**
 * Escribe líneas de texto en un fichero, rotándolo cuando supera
 * `maxBytes`: el fichero actual se renombra con un sufijo de timestamp y se
 * comienza uno nuevo. Conserva como máximo `maxFiles` ficheros rotados,
 * eliminando los más antiguos.
 */
export class RotatingFileWriter {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private rotationSequence = 0;

  constructor(options: RotatingFileWriterOptions) {
    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  }

  async appendLine(line: string): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.rotateIfNeeded(line.length + 1);
      await fs.appendFile(this.filePath, line + "\n", "utf-8");
    } catch (err) {
      throw LoggerError.wrap(err, {
        code: LoggerErrorCode.LOGGER_TRANSPORT_WRITE_FAILED,
        origin: "transport",
        recoverable: true,
        message: `Fallo al escribir en el fichero de log "${this.filePath}".`,
      });
    }
  }

  private async rotateIfNeeded(incomingBytes: number): Promise<void> {
    const { exists, size } = await this.statSafe();
    if (!exists) return; // No hay nada que rotar todavía: se creará al escribir.
    if (size + incomingBytes <= this.maxBytes) return;

    this.rotationSequence += 1;
    const rotatedPath = `${this.filePath}.${new Date().toISOString().replace(/[:.]/g, "-")}-${this.rotationSequence}`;
    await fs.rename(this.filePath, rotatedPath);
    await this.pruneOldRotations();
  }

  private async statSafe(): Promise<{ exists: boolean; size: number }> {
    try {
      const stat = await fs.stat(this.filePath);
      return { exists: true, size: stat.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  private async pruneOldRotations(): Promise<void> {
    const dir = path.dirname(this.filePath);
    const base = path.basename(this.filePath);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return;
    }
    const rotated = entries.filter((name) => name.startsWith(`${base}.`)).sort();
    const excess = rotated.length - this.maxFiles;
    if (excess <= 0) return;
    for (const name of rotated.slice(0, excess)) {
      await fs.unlink(path.join(dir, name)).catch(() => {
        // Un fallo al eliminar un fichero rotado antiguo no es crítico.
      });
    }
  }
}
