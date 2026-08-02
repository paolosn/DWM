/**
 * Catálogo de niveles de estado propio de `@dwm/status`, deliberadamente
 * pequeño y ampliable (a diferencia del catálogo cerrado de `SystemStatus`
 * del Core, pensado para el ciclo de vida de módulos). `UNKNOWN` cubre
 * tanto la ausencia de integración con un módulo como la imposibilidad de
 * determinar su estado.
 */
export type StatusLevel = "OK" | "WARNING" | "ERROR" | "UNKNOWN";

/** Orden de severidad, de mayor a menor, usado para agregar varios informes en uno global. */
const SEVERITY_ORDER: readonly StatusLevel[] = ["ERROR", "WARNING", "UNKNOWN", "OK"];

/** Devuelve el nivel más severo entre dos, según `SEVERITY_ORDER`. */
export function worstStatusLevel(a: StatusLevel, b: StatusLevel): StatusLevel {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/** Informe de estado de un único proveedor (módulo o subsistema). */
export interface StatusReport {
  readonly providerId: string;
  readonly level: StatusLevel;
  readonly message: string;
  readonly checkedAt: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * Contrato mínimo que debe cumplir cualquier proveedor de estado,
 * integrado (los doce módulos conocidos) o añadido en el futuro mediante
 * `StatusRegistry.register()`, sin necesidad de modificar `StatusManager`.
 */
export interface StatusProvider {
  readonly id: string;
  getStatus(): Promise<StatusReport> | StatusReport;
}

/** Informe agregado del estado global del Engine: el peor nivel entre todos los proveedores consultados. */
export interface GlobalStatusReport {
  readonly snapshotId: string;
  readonly level: StatusLevel;
  readonly generatedAt: string;
  readonly reports: readonly StatusReport[];
}

export function makeStatusReport(
  providerId: string,
  level: StatusLevel,
  message: string,
  detail?: Readonly<Record<string, unknown>>
): StatusReport {
  return {
    providerId,
    level,
    message,
    checkedAt: new Date().toISOString(),
    ...(detail ? { detail } : {}),
  };
}
