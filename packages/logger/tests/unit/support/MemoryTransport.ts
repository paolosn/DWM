import type { LogEntry } from "../../../src/LogEntry.js";
import type { LogTransport } from "../../../src/transports/LogTransport.js";

export class MemoryTransport implements LogTransport {
  readonly entries: LogEntry[] = [];
  disposed = false;

  constructor(private readonly options: { failWrite?: boolean; failDispose?: boolean } = {}) {}

  async write(entry: LogEntry): Promise<void> {
    if (this.options.failWrite) {
      throw new Error("fallo simulado de escritura");
    }
    this.entries.push(entry);
  }

  async dispose(): Promise<void> {
    if (this.options.failDispose) {
      throw new Error("fallo simulado de dispose");
    }
    this.disposed = true;
  }
}
