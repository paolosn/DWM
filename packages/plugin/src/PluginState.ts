export type PluginState =
  | "discovered"
  | "registered"
  | "installed"
  | "loaded"
  | "initialized"
  | "active"
  | "inactive"
  | "disabled"
  | "updating"
  | "failed"
  | "uninstalled";

const ALLOWED_TRANSITIONS: Record<PluginState, readonly PluginState[]> = {
  discovered: ["registered", "failed"],
  registered: ["installed", "failed"],
  installed: ["loaded", "uninstalled", "failed", "updating"],
  loaded: ["initialized", "failed", "updating"],
  initialized: ["active", "failed", "updating"],
  active: ["inactive", "updating", "failed"],
  inactive: ["active", "disabled", "updating", "uninstalled", "failed", "installed"],
  disabled: ["inactive", "uninstalled", "failed"],
  updating: ["initialized", "active", "inactive", "failed"],
  failed: ["registered", "installed", "loaded", "initialized", "inactive", "uninstalled"],
  uninstalled: [],
};

export function isPluginStateTransitionAllowed(from: PluginState, to: PluginState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
