export interface ToolCapability {
  readonly name: string;
  readonly version: string;
}

export interface ToolCapabilities {
  readonly provided: readonly ToolCapability[];
  readonly required: readonly ToolCapability[];
}

export function emptyToolCapabilities(): ToolCapabilities {
  return { provided: [], required: [] };
}
