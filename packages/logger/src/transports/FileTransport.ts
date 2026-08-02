import type { LogEntry } from "../LogEntry.js";
import type { LogTransport } from "./LogTransport.js";
import { RotatingFileWriter, type RotatingFileWriterOptions } from "./RotatingFileWriter.js";

function formatLine(entry: LogEntry): string {
  let line = `${entry.timestamp} [${entry.level.toUpperCase()}] (${entry.loggerName})`;
  if (entry.correlationId) line += ` {${entry.correlationId}}`;
  line += ` ${entry.message}`;
  if (entry.context && Object.keys(entry.context).length > 0) {
    line += ` context=${JSON.stringify(entry.context)}`;
  }
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    line += ` metadata=${JSON.stringify(entry.metadata)}`;
  }
  return line;
}

/** Transporte que escribe una línea de texto plano por entrada en un fichero rotado. */
export class FileTransport implements LogTransport {
  private readonly writer: RotatingFileWriter;

  constructor(options: RotatingFileWriterOptions) {
    this.writer = new RotatingFileWriter(options);
  }

  async write(entry: LogEntry): Promise<void> {
    await this.writer.appendLine(formatLine(entry));
  }
}
