/**
 * Entrada de secreto tal como se persiste: el valor real nunca aparece en
 * texto plano, solo `cipherText` (salida opaca del `SecretProvider`).
 */
export interface SecretEntry {
  readonly key: string;
  readonly cipherText: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rotatedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function createInitialEntry(
  key: string,
  cipherText: string,
  metadata?: Record<string, unknown>
): SecretEntry {
  const now = new Date().toISOString();
  return {
    key,
    cipherText,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(metadata ? { metadata } : {}),
  };
}

export function withUpdatedCipherText(entry: SecretEntry, cipherText: string): SecretEntry {
  return { ...entry, cipherText, updatedAt: new Date().toISOString() };
}

export function withRotatedCipherText(entry: SecretEntry, cipherText: string): SecretEntry {
  const now = new Date().toISOString();
  return { ...entry, cipherText, version: entry.version + 1, updatedAt: now, rotatedAt: now };
}
