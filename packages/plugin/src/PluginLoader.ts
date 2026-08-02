import type { PluginFactory } from "./PluginFactory.js";
import type { Plugin } from "./Plugin.js";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { PluginError } from "./errors/PluginError.js";

/**
 * Responsable exclusivo de invocar una `PluginFactory` para obtener una
 * instancia de `Plugin`, envolviendo cualquier fallo como
 * `PLUGIN_LOAD_FAILED`. No contiene lógica de resolución de módulos, `eval`
 * ni ejecución dinámica: la fábrica ya encapsula, fuera de este módulo, el
 * modo seguro de construir la instancia real.
 */
export class PluginLoader {
  async load(pluginId: string, factory: PluginFactory): Promise<Plugin> {
    try {
      return await factory.create();
    } catch (err) {
      throw PluginError.wrap(err, {
        code: PluginErrorCode.PLUGIN_LOAD_FAILED,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo al cargar el plugin "${pluginId}".`,
      });
    }
  }
}
