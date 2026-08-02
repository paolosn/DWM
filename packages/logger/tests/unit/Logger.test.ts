import { describe, it, expect } from "vitest";
import { Logger } from "../../src/Logger.js";
import { LogLevel } from "../../src/LogLevel.js";
import { MemoryTransport } from "./support/MemoryTransport.js";

describe("Logger", () => {
  it("respeta el nivel mínimo configurado", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.WARN, transports: [transport] });

    await logger.info("no debería aparecer");
    await logger.warn("sí debería aparecer");

    expect(transport.entries).toHaveLength(1);
    expect(transport.entries[0]!.message).toBe("sí debería aparecer");
  });

  it("registra timestamp UTC en formato ISO-8601", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });

    await logger.info("mensaje");

    expect(transport.entries[0]!.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it("incluye metadata cuando se proporciona", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });

    await logger.error("fallo", { code: "X1" });

    expect(transport.entries[0]!.metadata).toEqual({ code: "X1" });
  });

  it("no incluye metadata ni context si están vacíos", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("test", { minLevel: LogLevel.TRACE, transports: [transport] });

    await logger.debug("mensaje simple");

    expect(transport.entries[0]!.metadata).toBeUndefined();
    expect(transport.entries[0]!.context).toBeUndefined();
  });

  it("child() fusiona el contexto y compone el nombre", async () => {
    const transport = new MemoryTransport();
    const parent = new Logger(
      "app",
      { minLevel: LogLevel.TRACE, transports: [transport] },
      { service: "x" }
    );
    const child = parent.child({ requestId: "r1" }, "sub");

    await child.info("mensaje hijo");

    expect(child.name).toBe("app.sub");
    expect(transport.entries[0]!.loggerName).toBe("app.sub");
    expect(transport.entries[0]!.context).toEqual({ service: "x", requestId: "r1" });
  });

  it("child() no muta el logger padre", async () => {
    const transport = new MemoryTransport();
    const parent = new Logger(
      "app",
      { minLevel: LogLevel.TRACE, transports: [transport] },
      { a: 1 }
    );
    parent.child({ b: 2 });

    await parent.info("mensaje padre");

    expect(transport.entries[0]!.context).toEqual({ a: 1 });
  });

  it("withCorrelationId() adjunta el correlationId a las entradas siguientes", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("app", { minLevel: LogLevel.TRACE, transports: [transport] });
    const bound = logger.withCorrelationId("corr-123");

    await bound.info("con correlación");
    await logger.info("sin correlación");

    expect(transport.entries[0]!.correlationId).toBe("corr-123");
    expect(transport.entries[1]!.correlationId).toBeUndefined();
  });

  it("child() hereda el correlationId del padre", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("app", { minLevel: LogLevel.TRACE, transports: [transport] });
    const bound = logger.withCorrelationId("corr-abc");
    const child = bound.child({ x: 1 });

    await child.info("mensaje");

    expect(transport.entries[0]!.correlationId).toBe("corr-abc");
  });

  it("escribe en múltiples transportes simultáneamente", async () => {
    const t1 = new MemoryTransport();
    const t2 = new MemoryTransport();
    const logger = new Logger("multi", { minLevel: LogLevel.TRACE, transports: [t1, t2] });

    await logger.info("mensaje múltiple");

    expect(t1.entries).toHaveLength(1);
    expect(t2.entries).toHaveLength(1);
  });

  it("un transporte que falla no impide que los demás reciban la entrada", async () => {
    const failing = new MemoryTransport({ failWrite: true });
    const ok = new MemoryTransport();
    const errors: unknown[] = [];
    const logger = new Logger("resiliente", {
      minLevel: LogLevel.TRACE,
      transports: [failing, ok],
      onTransportError: (_transport, err) => errors.push(err),
    });

    await logger.info("mensaje");

    expect(ok.entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it("expone los seis niveles de log", async () => {
    const transport = new MemoryTransport();
    const logger = new Logger("niveles", { minLevel: LogLevel.TRACE, transports: [transport] });

    await logger.trace("t");
    await logger.debug("d");
    await logger.info("i");
    await logger.warn("w");
    await logger.error("e");
    await logger.fatal("f");

    expect(transport.entries.map((e) => e.level)).toEqual([
      LogLevel.TRACE,
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.FATAL,
    ]);
  });
});
