import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { BackupProvider, BackupProviderMetadata } from "./BackupProvider.js";
import type { BackupTarget } from "./BackupTarget.js";
import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { BackupError, createBackupError } from "./errors/BackupError.js";

/**
 * Proveedor de almacenamiento local. Valida que `target.path` quede
 * confinado bajo `allowedRoot` (sin escapes `..` ni rutas absolutas
 * ajenas), y escribe de forma atómica mediante un fichero temporal que
 * se renombra al finalizar, limpiando los restos si algo falla.
 */
export class LocalBackupProvider implements BackupProvider {
  readonly id = "local";

  constructor(private readonly allowedRoot: string) {}

  private resolveDir(target: BackupTarget): string {
    const resolvedRoot = path.resolve(this.allowedRoot);
    const resolvedTarget = path.resolve(resolvedRoot, target.path);
    const relative = path.relative(resolvedRoot, resolvedTarget);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_UNSAFE_PATH,
        message: `La ruta de destino "${target.path}" queda fuera del directorio permitido.`,
        origin: "target",
        recoverable: false,
      });
    }
    return resolvedTarget;
  }

  private fileFor(target: BackupTarget, key: string): string {
    if (key.includes("..") || path.isAbsolute(key)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_UNSAFE_PATH,
        message: `La clave de backup "${key}" no es una ruta relativa segura.`,
        origin: "target",
        recoverable: false,
      });
    }
    return path.join(this.resolveDir(target), `${key}.json`);
  }

  async exists(target: BackupTarget, key: string): Promise<boolean> {
    try {
      await fs.access(this.fileFor(target, key));
      return true;
    } catch {
      return false;
    }
  }

  async write(target: BackupTarget, key: string, payload: string): Promise<void> {
    const dir = this.resolveDir(target);
    const finalFile = this.fileFor(target, key);
    const tempFile = `${finalFile}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(tempFile, payload, "utf-8");
      await fs.rename(tempFile, finalFile);
    } catch (err) {
      await fs.unlink(tempFile).catch(() => {});
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_WRITE_FAILED,
        origin: "provider",
        recoverable: true,
        message: `Fallo al escribir el backup "${key}" en el proveedor local.`,
      });
    }
  }

  async read(target: BackupTarget, key: string): Promise<string | undefined> {
    try {
      return await fs.readFile(this.fileFor(target, key), "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
        origin: "provider",
        recoverable: true,
        message: `Fallo al leer el backup "${key}" del proveedor local.`,
      });
    }
  }

  async delete(target: BackupTarget, key: string): Promise<void> {
    try {
      await fs.unlink(this.fileFor(target, key));
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
        origin: "provider",
        recoverable: true,
        message: `Fallo al eliminar el backup "${key}" del proveedor local.`,
      });
    }
  }

  async list(target: BackupTarget): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.resolveDir(target));
      return entries
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length));
    } catch (err) {
      if (this.isNotFound(err)) return [];
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
        origin: "provider",
        recoverable: true,
        message: "Fallo al listar el contenido del proveedor local.",
      });
    }
  }

  async getMetadata(
    target: BackupTarget,
    key: string
  ): Promise<BackupProviderMetadata | undefined> {
    try {
      const stats = await fs.stat(this.fileFor(target, key));
      return { sizeBytes: stats.size };
    } catch (err) {
      if (this.isNotFound(err)) return undefined;
      throw BackupError.wrap(err, {
        code: BackupErrorCode.BACKUP_PROVIDER_ERROR,
        origin: "provider",
        recoverable: true,
        message: `Fallo al obtener metadatos del backup "${key}".`,
      });
    }
  }

  async checkCapacity(): Promise<boolean> {
    return true;
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
