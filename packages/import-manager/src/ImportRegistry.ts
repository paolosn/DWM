import type { ImportIssue, ImportRequest } from "./ImportTypes.js";
import { isImportStateTransitionAllowed, type ImportState } from "./ImportState.js";
import type { ImportProgress } from "./ImportProgress.js";
import type { ImportDescriptor } from "./ImportDescriptor.js";
import { ImportErrorCode } from "./errors/ImportErrorCode.js";
import { createImportError } from "./errors/ImportError.js";

export interface ImportRecord {
  readonly importId: string;
  readonly request: ImportRequest;
  readonly createdAt: string;
  startedAt?: string;
  completedAt?: string;
  destinationPath?: string;
  state: ImportState;
  filesImported: number;
  directoriesImported: number;
  progress?: ImportProgress;
  warnings: ImportIssue[];
  errors: ImportIssue[];
}

export interface ImportFilter {
  readonly sourceType?: ImportRequest["sourceType"];
  readonly state?: ImportState;
}

/** Mantiene el conjunto de operaciones de importación registradas (caché en memoria), su estado y progreso. */
export class ImportRegistry {
  private readonly records = new Map<string, ImportRecord>();

  register(importId: string, request: ImportRequest): void {
    if (this.records.has(importId)) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_OPERATION_CONFLICT,
        message: `Ya existe una importación registrada con id "${importId}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(importId, {
      importId,
      request,
      createdAt: new Date().toISOString(),
      state: "pending",
      filesImported: 0,
      directoriesImported: 0,
      warnings: [],
      errors: [],
    });
  }

  get(id: string): ImportRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): ImportRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_NOT_FOUND,
        message: `No existe ninguna importación registrada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  filter(criteria: ImportFilter): string[] {
    return this.list().filter((id) => {
      const record = this.require(id);
      if (criteria.sourceType && record.request.sourceType !== criteria.sourceType) return false;
      if (criteria.state && record.state !== criteria.state) return false;
      return true;
    });
  }

  toDescriptor(id: string): ImportDescriptor {
    const record = this.require(id);
    return {
      importId: record.importId,
      request: record.request,
      state: record.state,
      createdAt: record.createdAt,
      filesImported: record.filesImported,
      directoriesImported: record.directoriesImported,
      warnings: record.warnings,
      errors: record.errors,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
      ...(record.destinationPath ? { destinationPath: record.destinationPath } : {}),
      ...(record.progress ? { progress: record.progress } : {}),
    };
  }

  setState(id: string, next: ImportState): void {
    const record = this.require(id);
    if (!isImportStateTransitionAllowed(record.state, next)) {
      throw createImportError({
        code: ImportErrorCode.IMPORT_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setProgress(id: string, progress: ImportProgress): void {
    this.require(id).progress = progress;
  }

  setFilesImported(id: string, count: number): void {
    this.require(id).filesImported = count;
  }

  setDirectoriesImported(id: string, count: number): void {
    this.require(id).directoriesImported = count;
  }

  setDestinationPath(id: string, destinationPath: string): void {
    this.require(id).destinationPath = destinationPath;
  }

  setStartedAt(id: string, startedAt: string): void {
    this.require(id).startedAt = startedAt;
  }

  setCompletedAt(id: string, completedAt: string): void {
    this.require(id).completedAt = completedAt;
  }

  addWarning(id: string, issue: ImportIssue): void {
    this.require(id).warnings.push(issue);
  }

  addError(id: string, issue: ImportIssue): void {
    this.require(id).errors.push(issue);
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }
}
