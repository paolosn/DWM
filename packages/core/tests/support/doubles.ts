import type { StorageProvider } from "../../src/config/StorageProvider.js";
import type { IModule } from "../../src/contracts/IModule.js";
import type { IAdapter } from "../../src/contracts/IAdapter.js";

let counter = 0;
function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export interface MemoryStorageOptions {
  /** Claves cuya lectura debe lanzar una excepción simulada. */
  failReadFor?: Set<string>;
  /** Claves cuya escritura debe lanzar una excepción simulada. */
  failWriteFor?: Set<string>;
  /** Claves cuya lectura debe esperar a que se resuelva el thunk indicado. */
  delayReadFor?: Map<string, () => Promise<void>>;
}

/**
 * Doble de prueba de `StorageProvider`, en memoria. No usa el sistema de
 * ficheros ni ningún servicio externo; permite simular fallos de lectura o
 * escritura y retrasos controlados para probar condiciones de carrera.
 */
export class MemoryStorageProvider implements StorageProvider {
  private readonly store = new Map<string, string>();

  constructor(private readonly options: MemoryStorageOptions = {}) {}

  seed(key: string, value: string): void {
    this.store.set(key, value);
  }

  async read(key: string): Promise<string | null> {
    const delay = this.options.delayReadFor?.get(key);
    if (delay) {
      await delay();
    }
    if (this.options.failReadFor?.has(key)) {
      throw new Error(`Fallo simulado de lectura para "${key}"`);
    }
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async write(key: string, content: string): Promise<void> {
    if (this.options.failWriteFor?.has(key)) {
      throw new Error(`Fallo simulado de escritura para "${key}"`);
    }
    this.store.set(key, content);
  }

  async exists(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function makeModule(overrides: Partial<IModule> = {}): IModule {
  const module: IModule = {
    id: overrides.id ?? `test.module.${uniqueSuffix()}`,
    version: overrides.version ?? "1.0.0",
    contractVersion: overrides.contractVersion ?? "1.0.0",
    init: overrides.init ?? (async () => {}),
  };
  if (overrides.dispose) {
    module.dispose = overrides.dispose;
  }
  return module;
}

export function makeAdapter(overrides: Partial<IAdapter> = {}): IAdapter {
  const adapter: IAdapter = {
    id: overrides.id ?? `test.adapter.${uniqueSuffix()}`,
    subjectId: overrides.subjectId ?? `test.subject.${uniqueSuffix()}`,
    version: overrides.version ?? "1.0.0",
    contractVersion: overrides.contractVersion ?? "1.0.0",
    init: overrides.init ?? (async () => {}),
  };
  if (overrides.dispose) {
    adapter.dispose = overrides.dispose;
  }
  return adapter;
}
