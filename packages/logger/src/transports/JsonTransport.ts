import type { LogEntry } from "../LogEntry.js";
import type { LogTransport } from "./LogTransport.js";
import { RotatingFileWriter, type RotatingFileWriterOptions } from "./RotatingFileWriter.js";

/** Transporte que escribe cada entrada como una línea JSON (formato JSON Lines) en un fichero rotado. */
export class JsonTransport implements LogTransport {
  private readonly writer: RotatingFileWriter;

  constructor(options: RotatingFileWriterOptions) {
    this.writer = new RotatingFileWriter(options);
  }

  async write(entry: LogEntry): Promise<void> {
    await this.writer.appendLine(JSON.stringify(entry));
  }
}
