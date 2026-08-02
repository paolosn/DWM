import type { ToolCapabilities } from "./ToolCapabilities.js";

/**
 * Descriptor declarativo de una herramienta. Toda herramienta se apoya en
 * un adaptador ya registrado en `@dwm/adapters` (`adapterId`); este módulo
 * nunca contiene lógica específica de ese adaptador, solo la metadata y
 * orquestación de su ciclo de vida a nivel de herramienta.
 */
export interface ToolDescriptor {
  readonly id: string;
  readonly name: string;
  readonly adapterId: string;
  readonly capabilities: ToolCapabilities;
}
