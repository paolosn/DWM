export interface PluginCapability {
  readonly name: string;
  readonly version: string;
}

export interface PluginCapabilities {
  readonly provided: readonly PluginCapability[];
}

export function emptyPluginCapabilities(): PluginCapabilities {
  return { provided: [] };
}
