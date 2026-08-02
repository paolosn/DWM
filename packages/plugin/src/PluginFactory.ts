import type { Plugin } from "./Plugin.js";

/**
 * Fábrica de una instancia de `Plugin` concreta. Es la única vía para
 * obtener código ejecutable de un plugin: nunca se usa `eval` ni
 * `Function`, ni se descarga ni ejecuta código remoto. Quien registra la
 * fábrica es responsable de resolverla de forma segura (p. ej. un import
 * estático ya presente en el proceso).
 */
export interface PluginFactory {
  create(): Promise<Plugin> | Plugin;
}
