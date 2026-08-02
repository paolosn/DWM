export interface ProjectMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export function createInitialProjectMetadata(
  id: string,
  name: string,
  description: string
): ProjectMetadata {
  const now = new Date().toISOString();
  return { id, name, description, createdAt: now, updatedAt: now };
}

export function touchProjectMetadata(metadata: ProjectMetadata): ProjectMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}
