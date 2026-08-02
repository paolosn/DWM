/**
 * Módulo 33B — Adaptador tipado para una futura operación de logs.
 * Application API no expone actualmente `logs.*`: este adaptador define
 * la forma esperada para cuando exista, sin modificar Application API
 * ni inventar una operación. Hoy `isLogsOperationAvailable()` siempre
 * devuelve `false`; el día que `logs.query` (o el nombre que se elija)
 * exista en `ApplicationOperationMap`, esta función se actualiza para
 * comprobarlo y la pantalla deja de mostrar el aviso de no disponible.
 */
export interface LogEntry {
  readonly timestamp: string;
  readonly level: "debug" | "info" | "warn" | "error";
  readonly module: string;
  readonly message: string;
}

export interface LogsQueryParams {
  readonly module?: string;
  readonly level?: LogEntry["level"];
  readonly search?: string;
  readonly limit?: number;
}

export function isLogsOperationAvailable(): boolean {
  return false;
}
