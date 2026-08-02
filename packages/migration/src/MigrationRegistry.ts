import type { BackupIssue } from "@dwm/backup";
import { isMigrationStateTransitionAllowed, type MigrationState } from "./MigrationState.js";
import type { MigrationExportRequest, MigrationImportRequest } from "./MigrationRequest.js";
import type { MigrationDescriptor } from "./MigrationDescriptor.js";
import { MigrationErrorCode } from "./errors/MigrationErrorCode.js";
import { createMigrationError } from "./errors/MigrationError.js";

export interface MigrationRecord {
  readonly migrationId: string;
  readonly direction: "export" | "import";
  readonly request: MigrationExportRequest | MigrationImportRequest;
  readonly createdAt: string;
  completedAt?: string;
  state: MigrationState;
  backupId?: string;
  restoreId?: string;
  sourceDwmVersion?: string;
  warnings: BackupIssue[];
  errors: BackupIssue[];
}

export interface MigrationFilter {
  readonly direction?: "export" | "import";
  readonly state?: MigrationState;
}

/** Mantiene el conjunto de operaciones de migración registradas (caché en memoria), su estado y enlaces. */
export class MigrationRegistry {
  private readonly records = new Map<string, MigrationRecord>();

  register(
    migrationId: string,
    direction: "export" | "import",
    request: MigrationExportRequest | MigrationImportRequest
  ): void {
    if (this.records.has(migrationId)) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_OPERATION_CONFLICT,
        message: `Ya existe una migración registrada con id "${migrationId}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(migrationId, {
      migrationId,
      direction,
      request,
      createdAt: new Date().toISOString(),
      state: "pending",
      warnings: [],
      errors: [],
    });
  }

  get(id: string): MigrationRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): MigrationRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_NOT_FOUND,
        message: `No existe ninguna migración registrada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  filter(criteria: MigrationFilter): string[] {
    return this.list().filter((id) => {
      const record = this.require(id);
      if (criteria.direction && record.direction !== criteria.direction) return false;
      if (criteria.state && record.state !== criteria.state) return false;
      return true;
    });
  }

  toDescriptor(id: string): MigrationDescriptor {
    const record = this.require(id);
    return {
      migrationId: record.migrationId,
      direction: record.direction,
      request: record.request,
      state: record.state,
      createdAt: record.createdAt,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.backupId ? { backupId: record.backupId } : {}),
      ...(record.restoreId ? { restoreId: record.restoreId } : {}),
      ...(record.sourceDwmVersion ? { sourceDwmVersion: record.sourceDwmVersion } : {}),
    };
  }

  setState(id: string, next: MigrationState): void {
    const record = this.require(id);
    if (!isMigrationStateTransitionAllowed(record.state, next)) {
      throw createMigrationError({
        code: MigrationErrorCode.MIGRATION_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setBackupId(id: string, backupId: string): void {
    this.require(id).backupId = backupId;
  }

  setRestoreId(id: string, restoreId: string): void {
    this.require(id).restoreId = restoreId;
  }

  setSourceDwmVersion(id: string, version: string): void {
    this.require(id).sourceDwmVersion = version;
  }

  setCompletedAt(id: string, completedAt: string): void {
    this.require(id).completedAt = completedAt;
  }

  addWarning(id: string, issue: BackupIssue): void {
    this.require(id).warnings.push(issue);
  }

  addError(id: string, issue: BackupIssue): void {
    this.require(id).errors.push(issue);
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }
}
