import type { BackupTarget } from "./BackupTarget.js";

export interface BackupProviderMetadata {
  readonly sizeBytes: number;
}

/**
 * Abstracción de destino de almacenamiento de backups. Permite una
 * implementación local (segura y testeable) y deja preparada la
 * ampliación futura a carpeta de red, NAS, servidor o nube, sin
 * implementarlas todavía.
 */
export interface BackupProvider {
  readonly id: string;
  exists(target: BackupTarget, key: string): Promise<boolean>;
  write(target: BackupTarget, key: string, payload: string): Promise<void>;
  read(target: BackupTarget, key: string): Promise<string | undefined>;
  delete(target: BackupTarget, key: string): Promise<void>;
  list(target: BackupTarget): Promise<string[]>;
  getMetadata(target: BackupTarget, key: string): Promise<BackupProviderMetadata | undefined>;
  /** Comprobación de capacidad opcional; si se omite, se asume que hay espacio suficiente. */
  checkCapacity?(target: BackupTarget, estimatedBytes: number): Promise<boolean>;
}
