import { promises as fs } from "node:fs";

/**
 * Abstracción mínima de "¿existe esta ruta?" — nunca lee ni modifica el
 * contenido, solo confirma presencia. Igual que `SystemInfoProvider` y
 * `ProcessRunner`, es inyectable para poder simular sistemas de
 * archivos Windows/macOS en pruebas deterministas sin tocar el disco
 * real ni depender del SO donde corren.
 */
export interface FileSystemProbe {
  /** `true` si la ruta existe (fichero o directorio); nunca lanza. */
  exists(path: string): Promise<boolean>;
}

/** Implementación real, respaldada por `node:fs`. Sin caché: cada llamada consulta el disco. */
export class NodeFileSystemProbe implements FileSystemProbe {
  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
