export interface BackupPolicy {
  readonly protected: boolean;
  readonly tags: readonly string[];
}

export function defaultBackupPolicy(): BackupPolicy {
  return { protected: false, tags: [] };
}
