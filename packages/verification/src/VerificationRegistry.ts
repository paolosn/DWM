import {
  isVerificationStateTransitionAllowed,
  type VerificationState,
} from "./VerificationState.js";
import type { VerificationRequest } from "./VerificationRequest.js";
import type { VerificationCategory } from "./VerificationCategory.js";
import type { CheckResult } from "./CheckResult.js";
import type { VerificationSummary } from "./VerificationResult.js";
import type { VerificationDescriptor } from "./VerificationDescriptor.js";
import { VerificationErrorCode } from "./errors/VerificationErrorCode.js";
import { createVerificationError } from "./errors/VerificationError.js";

export interface VerificationRecord {
  readonly verificationId: string;
  readonly request: VerificationRequest;
  readonly createdAt: string;
  completedAt?: string;
  state: VerificationState;
  categories: readonly VerificationCategory[];
  checks: CheckResult[];
  summary: VerificationSummary;
}

export interface VerificationFilter {
  readonly state?: VerificationState;
  readonly category?: VerificationCategory;
}

const EMPTY_SUMMARY: VerificationSummary = { pass: 0, warning: 0, fail: 0 };

/** Mantiene el conjunto de verificaciones registradas (caché en memoria), su estado y resultados. */
export class VerificationRegistry {
  private readonly records = new Map<string, VerificationRecord>();

  register(
    verificationId: string,
    request: VerificationRequest,
    categories: readonly VerificationCategory[]
  ): void {
    if (this.records.has(verificationId)) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_OPERATION_CONFLICT,
        message: `Ya existe una verificación registrada con id "${verificationId}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    this.records.set(verificationId, {
      verificationId,
      request,
      categories,
      createdAt: new Date().toISOString(),
      state: "pending",
      checks: [],
      summary: EMPTY_SUMMARY,
    });
  }

  get(id: string): VerificationRecord | undefined {
    return this.records.get(id);
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  require(id: string): VerificationRecord {
    const record = this.records.get(id);
    if (!record) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_NOT_FOUND,
        message: `No existe ninguna verificación registrada con id "${id}".`,
        origin: "registry",
        recoverable: true,
      });
    }
    return record;
  }

  list(): string[] {
    return [...this.records.keys()].sort();
  }

  filter(criteria: VerificationFilter): string[] {
    return this.list().filter((id) => {
      const record = this.require(id);
      if (criteria.state && record.state !== criteria.state) return false;
      if (criteria.category && !record.categories.includes(criteria.category)) return false;
      return true;
    });
  }

  toDescriptor(id: string): VerificationDescriptor {
    const record = this.require(id);
    return {
      verificationId: record.verificationId,
      request: record.request,
      state: record.state,
      createdAt: record.createdAt,
      categories: record.categories,
      checks: record.checks,
      summary: record.summary,
      ...(record.completedAt ? { completedAt: record.completedAt } : {}),
    };
  }

  setState(id: string, next: VerificationState): void {
    const record = this.require(id);
    if (!isVerificationStateTransitionAllowed(record.state, next)) {
      throw createVerificationError({
        code: VerificationErrorCode.VERIFICATION_INVALID_STATE_TRANSITION,
        message: `Transición de estado no permitida para "${id}": "${record.state}" → "${next}".`,
        origin: "lifecycle",
        recoverable: true,
      });
    }
    record.state = next;
  }

  setChecks(id: string, checks: readonly CheckResult[]): void {
    const record = this.require(id);
    record.checks = [...checks];
    record.summary = checks.reduce<VerificationSummary>(
      (summary, check) => ({ ...summary, [check.status]: summary[check.status] + 1 }),
      { pass: 0, warning: 0, fail: 0 }
    );
  }

  setCompletedAt(id: string, completedAt: string): void {
    this.require(id).completedAt = completedAt;
  }

  unregister(id: string): void {
    this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }
}
