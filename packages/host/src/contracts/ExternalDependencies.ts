/**
 * Formas mínimas de las dependencias externas descritas conceptualmente en
 * TDS-001 §5.1. Son contratos propios del ecosistema de módulos, no
 * reexportaciones de tipos internos del Core; ninguna implementación
 * concreta de estos contratos (un backend real de red, de cifrado, etc.)
 * forma parte de esta fase.
 */

/** Almacenamiento propio de un módulo (forma conceptual, no el StorageProvider interno del Core). */
export interface HostStorage {
  read(key: string): Promise<string | null>;
  write(key: string, content: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Reloj: permite obtener el instante actual sin depender del sistema operativo. */
export interface Clock {
  now(): Date;
}

/** Generador de identificadores únicos. */
export interface IdGenerator {
  generate(): string;
}

/** Cifrado y descifrado de valores. */
export interface Crypto {
  encrypt(plainText: string): Promise<string>;
  decrypt(cipherText: string): Promise<string>;
}

/** Acceso de red para solicitudes salientes. */
export interface NetworkAccess {
  request(input: { url: string; method: string; body?: string }): Promise<{
    status: number;
    body: string;
  }>;
}

/** Sistema de archivos abstracto para rutas y ficheros reales del equipo. */
export interface AbstractFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
