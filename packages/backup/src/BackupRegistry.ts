import type { BackupManifest } from "./BackupManifest.js";
import { isBackupStateTransitionAllowed, type BackupState } from "./BackupState.js";
import type { BackupProgress } from "./BackupProgress.js";
import type { BackupPolicy } from "./BackupPolicy.js";
import { defaultBackupPolicy } from "./BackupPolicy.js";
import type { BackupIssue } from "./BackupResult.js";
import type { BackupType } from "./BackupType.js";
import type { BackupResourceType } from "./BackupResource.js";
import type { BackupDescriptor } from "./BackupDescriptor.js";
import { BackupErrorCode } from "./errors/BackupErrorCode.js";
import { createBackupError } from "./errors/BackupError.js";

export interface BackupRecord {
  manifest: BackupManifest;
  state: BackupState;
  policy: BackupPolicy;
  progress?: BackupProgress;
  warnings: BackupIssue[];
  errors: BackupIssue[];
}

export interface BackupFilter {
  readonly type?: BackupType;
  readonly state?: BackupState;
  readonly resourceType?: BackupResourceType;
  readonly resourceId?: string;
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

/** Mantiene el conjunto de backups registrados (caché en memoria), su estado y progreso. */
export class BackupRegistry {
  private readonly records = new Map<string, BackupRecord>();

  register(
    manifest: BackupManifest,
    state: BackupState = "pending",
    policy: BackupPolicy = defaultBackupPolicy()
  ): void {
    if (this.records.has(manifest.id)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_OPERATION_CONFLICT,
        message: `Ya existe un backup registrado con id "${manifest.id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(manifest.id, { manifest, state, policy, warnings: [], errors: [] });
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  get(id: string): BackupRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): BackupRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_NOT_FOUND,
        message: `No existe ningún backup registrado con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  toDescriptor(id: string): BackupDescriptor {
    const record = this.require(id);
    return {
      manifest: record.manifest,
      state: record.state,
      policy: record.policy,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.progress ? { progress: record.progress } : {}),
    };
  }

  filter(criteria: BackupFilter): string[] {
    return this.list().filter((id) => {
      const record = this.require(id);
      if (criteria.type && record.manifest.type !== criteria.type) return false;
      if (criteria.state && record.state !== criteria.state) return false;
      if (criteria.createdAfter && record.manifest.createdAt < criteria.createdAfter) return false;
      if (criteria.createdBefore && record.manifest.createdAt > criteria.createdBefore)
        return false;
      if (criteria.resourceId || criteria.resourceType) {
        const matches = record.manifest.includedResources.some(
          (resource) =>
            (!criteria.resourceType || resource.resourceType === criteria.resourceType) &&
            (!criteria.resourceId || resource.resourceId === criteria.resourceId)
        );
        if (!matches) return false;
      }
      return true;
    });
  }

  setState(id: string, next: BackupState): void {
    const record = this.require(id);
    if (!isBackupStateTransitionAllowed(record.state, next)) {
      throw createBackupError({
        code: BackupErrorCode.BACKUP_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setProgress(id: string, progress: BackupProgress): void {
    this.require(id).progress = progress;
  }

  addWarning(id: string, issue: BackupIssue): void {
    this.require(id).warnings.push(issue);
  }

  addError(id: string, issue: BackupIssue): void {
    this.require(id).errors.push(issue);
  }

  replaceManifest(id: string, manifest: BackupManifest): void {
    this.require(id).manifest = manifest;
  }

  setPolicy(id: string, policy: BackupPolicy): void {
    this.require(id).policy = policy;
  }

  /** Ids de backups incrementales, no eliminados, cuyo backup base es `id`. */
  getDependentIncrementals(id: string): string[] {
    return this.list().filter((otherId) => {
      const other = this.require(otherId);
      return other.manifest.baseBackupId === id && other.state !== "deleted";
    });
  }

  clear(): void {
    this.records.clear();
  }
}
