import type { Plugin } from "./Plugin.js";
import type { PluginContext } from "./PluginContext.js";
import { PluginErrorCode } from "./errors/PluginErrorCode.js";
import { PluginError } from "./errors/PluginError.js";

/**
 * Invoca los ganchos de ciclo de vida (`onInstall`/`onLoad`/`onInit`/
 * `onActivate`/`onDeactivate`/`onUnload`/`onUninstall`) de una instancia de
 * `Plugin`, traduciendo cualquier fallo al `PluginErrorCode` específico de
 * la fase correspondiente. No conoce el registro ni la persistencia: solo
 * orquesta la invocación segura de los propios ganchos.
 */
export class PluginLifecycle {
  async install(pluginId: string, plugin: Plugin, context: PluginContext): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_INSTALL_FAILED, () =>
      plugin.onInstall(context)
    );
  }

  async load(pluginId: string, plugin: Plugin, context: PluginContext): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_LOAD_FAILED, () => plugin.onLoad(context));
  }

  async initialize(pluginId: string, plugin: Plugin, context: PluginContext): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_INIT_FAILED, () => plugin.onInit(context));
  }

  async activate(pluginId: string, plugin: Plugin, context: PluginContext): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_ACTIVATE_FAILED, () =>
      plugin.onActivate(context)
    );
  }

  async deactivate(pluginId: string, plugin: Plugin): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_DEACTIVATE_FAILED, () => plugin.onDeactivate());
  }

  async unload(pluginId: string, plugin: Plugin): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_LOAD_FAILED, () => plugin.onUnload());
  }

  async uninstall(pluginId: string, plugin: Plugin): Promise<void> {
    await this.run(pluginId, PluginErrorCode.PLUGIN_UNINSTALL_FAILED, () => plugin.onUninstall());
  }

  async checkHealth(plugin: Plugin): Promise<boolean> {
    return plugin.checkHealth();
  }

  private async run(
    pluginId: string,
    code: PluginErrorCode,
    fn: () => Promise<void>
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      throw PluginError.wrap(err, {
        code,
        origin: "lifecycle",
        recoverable: true,
        message: `Fallo en el ciclo de vida del plugin "${pluginId}" (${code}).`,
      });
    }
  }
}
