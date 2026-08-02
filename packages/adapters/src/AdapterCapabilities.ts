export interface AdapterCapability {
  readonly name: string;
  readonly version: string;
}

export interface AdapterCapabilities {
  readonly provided: readonly AdapterCapability[];
  readonly required: readonly AdapterCapability[];
}

export function emptyCapabilities(): AdapterCapabilities {
  return { provided: [], required: [] };
}
