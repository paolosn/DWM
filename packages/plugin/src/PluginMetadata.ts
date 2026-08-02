export interface PluginMetadata {
  readonly id: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export function createInitialPluginMetadata(id: string): PluginMetadata {
  const now = new Date().toISOString();
  return { id, installedAt: now, updatedAt: now };
}

export function touchPluginMetadata(metadata: PluginMetadata): PluginMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}
