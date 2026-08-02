import type { AdapterSubject } from "./AdapterSubject.js";
import type { AdapterCapabilities } from "./AdapterCapabilities.js";
import type { AdapterContext } from "./AdapterContext.js";
import { emptyCapabilities } from "./AdapterCapabilities.js";

/**
 * Clase base para cualquier adaptador concreto. Define el ciclo de vida
 * común (`onInit`/`onActivate`/`onDeactivate`/`onDispose`/`checkHealth`)
 * con implementaciones por defecto no-op/saludable, para que un adaptador
 * concreto (VSCode, Cursor, Windsurf, Claude Code, Git, Ollama, OpenAI,
 * Anthropic... — ninguno implementado todavía) solo tenga que sobrescribir
 * lo que realmente necesite. No contiene ninguna lógica específica de
 * herramienta alguna.
 */
export abstract class BaseAdapter {
  abstract readonly id: string;
  abstract readonly subject: AdapterSubject;
  abstract readonly version: string;
  abstract readonly contractVersion: string;

  get capabilities(): AdapterCapabilities {
    return emptyCapabilities();
  }

  async onInit(_context: AdapterContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onActivate(_context: AdapterContext): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onDeactivate(): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async onDispose(): Promise<void> {
    // Sin comportamiento por defecto; sobrescribible.
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }
}
