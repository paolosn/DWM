import type { BackupResourceType, BackupTarget } from "@dwm/backup";

export interface RestoreRequest {
  readonly backupId: string;
  /** Si se indica, restaura únicamente los recursos de estos tipos (restauración selectiva). */
  readonly resourceTypes?: readonly BackupResourceType[];
  /** Ubicación alternativa opcional; si se omite, se usa el mismo destino del backup. */
  readonly targetOverride?: BackupTarget;
  readonly dryRun?: boolean;
  /** Permite sobrescribir recursos marcados como protegidos. */
  readonly allowOverwriteProtected?: boolean;
}
