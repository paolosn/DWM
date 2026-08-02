/**
 * Contrato de almacenamiento clave-valor de texto, inyectado en el Core.
 *
 * El Core no asume ningún backend concreto (sistema de ficheros, base de
 * datos embebida, almacenamiento remoto...). Cualquier lógica realmente
 * específica de sistema operativo (rutas, permisos, convenciones de cada
 * plataforma) queda fuera de esta interfaz y, si existiera, sería resuelta
 * por quien implemente este contrato, nunca por el Core.
 *
 * La implementación de referencia incluida en este paquete
 * (`FileSystemStorageProvider`) usa las APIs de Node.js, que ya son
 * multiplataforma por diseño; no contiene ramas de código por sistema
 * operativo.
 */
export interface StorageProvider {
  /** Devuelve el contenido asociado a la clave, o null si no existe. */
  read(key: string): Promise<string | null>;

  /** Escribe (crea o sobrescribe) el contenido asociado a la clave. */
  write(key: string, content: string): Promise<void>;

  /** Indica si existe contenido asociado a la clave. */
  exists(key: string): Promise<boolean>;

  /** Elimina el contenido asociado a la clave, si existe. */
  delete(key: string): Promise<void>;
}
