import type { PluginContext } from "./PluginContext.js";

/**
 * Clase base para cualquier plugin concreto. Define el ciclo de vida común
 * con implementaciones por defecto no-op/saludable; un plugin real (aún no
 * implementado: ningún plugin de WordPress, Laravel, Git, VSCode, OpenCode,
 * IA, backups, etc.) solo sobrescribe lo que necesite. No contiene ninguna
 * lógica específica de ningún plugin funcional.
 */
export abstract class Plugin {
  async onInstall(_context: PluginContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onLoad(_context: PluginContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onInit(_context: PluginContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onActivate(_context: PluginContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onDeactivate(): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onUnload(): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onUninstall(): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }
}
