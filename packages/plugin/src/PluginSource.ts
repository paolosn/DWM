import type { PluginManifest } from "./PluginManifest.js";

/**
 * Fuente abstracta desde la que se descubren manifiestos de plugins. No
 * ejecuta ningún código de plugin durante el descubrimiento: solo produce
 * datos declarativos (`PluginManifest`). Permite futuras fuentes locales o
 * remotas sin acoplar `PluginManager` a ninguna implementación concreta.
 */
export interface PluginSource {
  discover(): Promise<readonly PluginManifest[]>;
}

/** Fuente estática (en memoria) útil para pruebas o catálogos precargados. */
export class StaticPluginSource implements PluginSource {
  constructor(private readonly manifests: readonly PluginManifest[]) {}

  async discover(): Promise<readonly PluginManifest[]> {
    return this.manifests;
  }
}
