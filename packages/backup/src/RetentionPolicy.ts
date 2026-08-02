import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { createBackupError } from "./errors/BackupError.js";

export interface RetentionPolicy {
  readonly id: string;
  /** Conserva como máximo los últimos N backups completados (por tipo, si `perType` es true). */
  readonly keepLast?: number;
  /** Conserva los backups completados en los últimos N días. */
  readonly keepForDays?: number;
  /** Si es true, `keepLast` se aplica de forma independiente a completos e incrementales. */
  readonly perType?: boolean;
}

export function validateRetentionPolicy(policy: RetentionPolicy): void {
  if (
    !policy ||
    typeof policy !== "object" ||
    typeof policy.id !== "string" ||
    policy.id.length === 0
  ) {
    throw createBackupError({
      code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY,
      message: "RetentionPolicy.id es obligatorio y debe ser una cadena no vacía.",
      origin: "retention",
      recoverable: false,
    });
  }
  if (
    policy.keepLast !== undefined &&
    (typeof policy.keepLast !== "number" || policy.keepLast < 0)
  ) {
    throw createBackupError({
      code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY,
      message: "RetentionPolicy.keepLast debe ser un número >= 0 si se indica.",
      origin: "retention",
      recoverable: false,
    });
  }
  if (
    policy.keepForDays !== undefined &&
    (typeof policy.keepForDays !== "number" || policy.keepForDays < 0)
  ) {
    throw createBackupError({
      code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY,
      message: "RetentionPolicy.keepForDays debe ser un número >= 0 si se indica.",
      origin: "retention",
      recoverable: false,
    });
  }
  if (policy.keepLast === undefined && policy.keepForDays === undefined) {
    throw createBackupError({
      code: BackupErrorCode.BACKUP_INVALID_RETENTION_POLICY,
      message: "RetentionPolicy debe declarar al menos keepLast o keepForDays.",
      origin: "retention",
      recoverable: false,
    });
  }
}
