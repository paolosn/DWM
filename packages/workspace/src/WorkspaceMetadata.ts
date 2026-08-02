export interface WorkspaceMetadata {
  readonly id: string;
  readonly name: string;
  readonly rootPath: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export function createInitialMetadata(
  id: string,
  name: string,
  rootPath: string
): WorkspaceMetadata {
  const now = new Date().toISOString();
  return { id, name, rootPath, createdAt: now, updatedAt: now };
}

export function touchMetadata(metadata: WorkspaceMetadata): WorkspaceMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}
