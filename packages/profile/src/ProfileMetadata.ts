export interface ProfileMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly custom?: Readonly<Record<string, unknown>>;
}

export function createInitialProfileMetadata(
  id: string,
  name: string,
  description: string
): ProfileMetadata {
  const now = new Date().toISOString();
  return { id, name, description, createdAt: now, updatedAt: now };
}

export function touchProfileMetadata(metadata: ProfileMetadata): ProfileMetadata {
  return { ...metadata, updatedAt: new Date().toISOString() };
}
