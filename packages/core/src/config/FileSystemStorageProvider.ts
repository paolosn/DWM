import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { StorageProvider } from "./StorageProvider.js";

/**
 * Implementación de referencia de `StorageProvider` sobre el sistema de
 * ficheros, usando exclusivamente las APIs multiplataforma de Node.js
 * (`node:fs`, `node:path`). No contiene ninguna rama de código condicionada
 * por sistema operativo: Node.js ya resuelve esas diferencias internamente.
 *
 * Las claves se tratan como rutas relativas dentro de `rootDir` (que, en el
 * sistema completo, corresponderá al área de configuración dentro de
 * `SISTEMA-DE-TRABAJO`, si bien esta clase desconoce ese detalle: solo recibe
 * un directorio raíz).
 */
export class FileSystemStorageProvider implements StorageProvider {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    // path.join ya normaliza separadores por plataforma de forma transparente.
    return path.join(this.rootDir, key);
  }

  async read(key: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolveKey(key), "utf-8");
    } catch (err) {
      if (this.isNotFound(err)) return null;
      throw err;
    }
  }

  async write(key: string, content: string): Promise<void> {
    const fullPath = this.resolveKey(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (err) {
      if (!this.isNotFound(err)) throw err;
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
