import { describe, it, expect } from "vitest";
import { ConsoleTransport } from "../../src/transports/ConsoleTransport.js";
import { LogLevel } from "../../src/LogLevel.js";
import type { LogEntry } from "../../src/LogEntry.js";

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    level: LogLevel.INFO,
    loggerName: "test",
    message: "mensaje",
    ...overrides,
  };
}

describe("ConsoleTransport", () => {
  it("usa console.error para error y fatal", async () => {
    const calls: Array<{ channel: string; line: string }> = [];
    const transport = new ConsoleTransport({
      log: (line) => calls.push({ channel: "log", line }),
      warn: (line) => calls.push({ channel: "warn", line }),
      error: (line) => calls.push({ channel: "error", line }),
    });

    await transport.write(makeEntry({ level: LogLevel.ERROR }));
    await transport.write(makeEntry({ level: LogLevel.FATAL }));

    expect(calls.map((c) => c.channel)).toEqual(["error", "error"]);
  });

  it("usa console.warn para warn y console.log para el resto", async () => {
    const calls: string[] = [];
    const transport = new ConsoleTransport({
      log: () => calls.push("log"),
      warn: () => calls.push("warn"),
      error: () => calls.push("error"),
    });

    await transport.write(makeEntry({ level: LogLevel.WARN }));
    await transport.write(makeEntry({ level: LogLevel.INFO }));
    await transport.write(makeEntry({ level: LogLevel.DEBUG }));

    expect(calls).toEqual(["warn", "log", "log"]);
  });

  it("incluye correlationId, context y metadata en la línea formateada", async () => {
    let lastLine = "";
    const transport = new ConsoleTransport({
      log: (line) => (lastLine = line),
      warn: () => {},
      error: () => {},
    });

    await transport.write(
      makeEntry({ correlationId: "corr-1", context: { a: 1 }, metadata: { b: 2 } })
    );

    expect(lastLine).toContain("{corr-1}");
    expect(lastLine).toContain('context={"a":1}');
    expect(lastLine).toContain('metadata={"b":2}');
  });

  it("usa el escritor por defecto (console real) sin lanzar", async () => {
    const transport = new ConsoleTransport();
    await expect(transport.write(makeEntry())).resolves.toBeUndefined();
  });
});
