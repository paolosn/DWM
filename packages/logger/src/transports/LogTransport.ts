import type { LogEntry } from "../LogEntry.js";

/** Contrato mínimo que debe cumplir cualquier transporte de log. */
export interface LogTransport {
  write(entry: LogEntry): Promise<void>;
  dispose?(): Promise<void>;
}
