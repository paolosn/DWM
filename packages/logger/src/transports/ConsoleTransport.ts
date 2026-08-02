import type { LogEntry } from "../LogEntry.js";
import type { LogTransport } from "./LogTransport.js";
import { LogLevel } from "../LogLevel.js";

export interface ConsoleWriter {
  log(line: string): void;
  warn(line: string): void;
  error(line: string): void;
}

const defaultWriter: ConsoleWriter = {
  log: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function formatLine(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
    `(${entry.loggerName})`,
    entry.correlationId ? `{${entry.correlationId}}` : undefined,
    entry.message,
  ].filter((part): part is string => part !== undefined);
  let line = parts.join(" ");
  if (entry.context && Object.keys(entry.context).length > 0) {
    line += ` context=${JSON.stringify(entry.context)}`;
  }
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    line += ` metadata=${JSON.stringify(entry.metadata)}`;
  }
  return line;
}

/**
 * Transporte que escribe una línea formateada por entrada a la consola,
 * usando `console.error` para `error`/`fatal`, `console.warn` para `warn`,
 * y `console.log` para el resto.
 */
export class ConsoleTransport implements LogTransport {
  constructor(private readonly writer: ConsoleWriter = defaultWriter) {}

  async write(entry: LogEntry): Promise<void> {
    const line = formatLine(entry);
    if (entry.level === LogLevel.ERROR || entry.level === LogLevel.FATAL) {
      this.writer.error(line);
    } else if (entry.level === LogLevel.WARN) {
      this.writer.warn(line);
    } else {
      this.writer.log(line);
    }
  }
}
