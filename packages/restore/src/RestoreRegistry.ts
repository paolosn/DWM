import type { BackupIssue } from "@dwm/backup";
import { isRestoreStateTransitionAllowed, type RestoreState } from "./RestoreState.js";
import type { RestoreProgress } from "./RestoreProgress.js";
import type { RestoreRequest } from "./RestoreRequest.js";
import type { RestoreDescriptor } from "./RestoreDescriptor.js";
import { RestoreErrorCode } from "./errors/RestoreErrorCode.js";
import { createRestoreError } from "./errors/RestoreError.js";

export interface RestoreRecord {
  readonly restoreId: string;
  readonly request: RestoreRequest;
  readonly createdAt: string;
  startedAt?: string;
  completedAt?: string;
  state: RestoreState;
  itemsRestored: number;
  progress?: RestoreProgress;
  warnings: BackupIssue[];
  errors: BackupIssue[];
}

export interface RestoreFilter {
  readonly backupId?: string;
  readonly state?: RestoreState;
}

/** Mantiene el conjunto de operaciones de restauración registradas (caché en memoria), su estado y progreso. */
export class RestoreRegistry {
  private readonly records = new Map<string, RestoreRecord>();

  register(restoreId: string, request: RestoreRequest): void {
    if (this.records.has(restoreId)) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_OPERATION_CONFLICT,
        message: `Ya existe una restauración registrada con id "${restoreId}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(restoreId, {
      restoreId,
      request,
      createdAt: new Date().toISOString(),
      state: "pending",
      itemsRestored: 0,
      warnings: [],
      errors: [],
    });
  }

  get(id: string): RestoreRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): RestoreRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_NOT_FOUND,
        message: `No existe ninguna restauración registrada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  filter(criteria: RestoreFilter): string[] {
    return this.list().filter((id) => {
      const record = this.require(id);
      if (criteria.backupId && record.request.backupId !== criteria.backupId) return false;
      if (criteria.state && record.state !== criteria.state) return false;
      return true;
    });
  }

  toDescriptor(id: string): RestoreDescriptor {
    const record = this.require(id);
    return {
      restoreId: record.restoreId,
      request: record.request,
      state: record.state,
      createdAt: record.createdAt,
      itemsRestored: record.itemsRestored,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.progress ? { progress: record.progress } : {}),
    };
  }

  setState(id: string, next: RestoreState): void {
    const record = this.require(id);
    if (!isRestoreStateTransitionAllowed(record.state, next)) {
      throw createRestoreError({
        code: RestoreErrorCode.RESTORE_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setProgress(id: string, progress: RestoreProgress): void {
    this.require(id).progress = progress;
  }

  setItemsRestored(id: string, count: number): void {
    this.require(id).itemsRestored = count;
  }

  setStartedAt(id: string, startedAt: string): void {
    this.require(id).startedAt = startedAt;
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
