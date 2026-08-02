import type { ClientDwmMetadata } from "./ClientTypes.js";

/**
 * Responsable exclusivo de construir y mutar el bloque `dwm` reservado
 * de un cliente (ciclo de vida técnico: archivado/fechas), de forma
 * consistente. No toca el sistema de ficheros ni el resto de campos de
 * negocio del cliente — eso es responsabilidad de `ClientRepository` y
 * `ClientManager`.
 */
export class ClientMetadataService {
  createInitial(): ClientDwmMetadata {
    const now = new Date().toISOString();
    return { archived: false, createdAt: now, updatedAt: now };
  }

  /** Metadatos resultantes de editar un cliente existente: conserva todo salvo `updatedAt`. */
  withTouchedTimestamp(metadata: ClientDwmMetadata): ClientDwmMetadata {
    return { ...metadata, updatedAt: new Date().toISOString() };
  }

  withArchived(metadata: ClientDwmMetadata): ClientDwmMetadata {
    const now = new Date().toISOString();
    return { ...metadata, archived: true, archivedAt: now, updatedAt: now };
  }

  withRestored(metadata: ClientDwmMetadata): ClientDwmMetadata {
    const { archivedAt: _archivedAt, ...rest } = metadata;
    return { ...rest, archived: false, updatedAt: new Date().toISOString() };
  }

  /** Metadatos reconstruidos para un cliente cuyo fichero fue creado/modificado fuera de este módulo (fallback usando fechas del propio fichero). */
  fromFallback(stat: { createdAt: string; updatedAt: string }): ClientDwmMetadata {
    return { archived: false, createdAt: stat.createdAt, updatedAt: stat.updatedAt };
  }
}
