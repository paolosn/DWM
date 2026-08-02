import type { ShutdownReport as CoreShutdownReport } from "@dwm/core";
import type { HostError } from "../errors/HostError.js";
import type { CleanupFailure } from "../composition/CleanupStack.js";

export type ComponentOutcome =
  | "registered"
  | "omitted-by-configuration"
  | "omitted-by-dependency"
  | "omitted-by-cycle"
  | "construction-failed"
  | "registration-failed"
  | "rollback-performed";

export interface ComponentReportEntry {
  readonly componentId: string;
  readonly outcome: ComponentOutcome;
  readonly detail?: string;
}

export interface CompositionReport {
  readonly components: readonly ComponentReportEntry[];
  /** Presente únicamente si la composición abortó por un fallo mandatorio o una cancelación. */
  readonly originalError?: HostError;
  readonly rollbackFailures: readonly CleanupFailure[];
  /** Presente solo si hubo al menos un fallo durante la propia limpieza (TDS-001 §8.2, punto 4). */
  readonly rollbackAggregateError?: HostError;
  readonly cancelled: boolean;
}

export interface ShutdownReportSummary {
  readonly core?: CoreShutdownReport;
  readonly externalDependencyFailures: readonly CleanupFailure[];
}

/**
 * Estructura de datos de solo lectura que agrega el resultado de
 * composición, registro, rollback y apagado (TDS-001 §2.10, §9.4).
 */
export interface HostStatusReport {
  readonly composition?: CompositionReport;
  readonly shutdown?: ShutdownReportSummary;
}

export function emptyHostStatusReport(): HostStatusReport {
  return {};
}
