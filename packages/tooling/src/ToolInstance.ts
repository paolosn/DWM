import type { ToolDescriptor } from "./ToolDescriptor.js";
import type { ToolConfiguration } from "./ToolConfiguration.js";
import type { ToolState } from "./ToolState.js";
import type { ToolHealth } from "./ToolHealth.js";

/** Instantánea de solo lectura de una herramienta registrada, para introspección. */
export interface ToolInstance {
  readonly descriptor: ToolDescriptor;
  readonly configuration: ToolConfiguration;
  readonly state: ToolState;
  readonly health?: ToolHealth;
}
