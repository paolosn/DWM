import { describe, it, expect } from "vitest";
import { LoggerFactory } from "../../src/LoggerFactory.js";
import { validateLoggerConfiguration } from "../../src/LoggerConfiguration.js";
import { LogLevel } from "../../src/LogLevel.js";
import { LoggerErrorCode } from "../../src/errors/LoggerErrorCode.js";
import { MemoryTransport } from "./support/MemoryTransport.js";

describe("LoggerFactory", () => {
  it("crea loggers independientes con el contexto indicado", async () => {
    const transport = new MemoryTransport();
    const factory = new LoggerFactory({ minLevel: LogLevel.TRACE, transports: [transport] });

    const a = factory.createLogger("a", { tag: "A" });
    const b = factory.createLogger("b");

    await a.info("desde a");
    await b.info("desde b");

    expect(transport.entries[0]).toMatchObject({ loggerName: "a", context: { tag: "A" } });
    expect(transport.entries[1]).toMatchObject({ loggerName: "b" });
    expect(transport.entries[1]!.context).toBeUndefined();
  });

  it("valida la configuración al construirse", () => {
    expect(() => new LoggerFactory({ minLevel: LogLevel.INFO, transports: [] })).toThrow(
      expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION })
    );
  });
});

describe("validateLoggerConfiguration", () => {
  it("acepta una configuración válida", () => {
    expect(() =>
      validateLoggerConfiguration({ minLevel: LogLevel.INFO, transports: [new MemoryTransport()] })
    ).not.toThrow();
  });

  it("rechaza config ausente o no-objeto", () => {
    expect(() => validateLoggerConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION })
    );
  });

  it("rechaza minLevel inválido", () => {
    expect(() =>
      validateLoggerConfiguration({
        minLevel: "verbose" as never,
        transports: [new MemoryTransport()],
      })
    ).toThrow(expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION }));
  });

  it("rechaza transports vacío o no-array", () => {
    expect(() => validateLoggerConfiguration({ minLevel: LogLevel.INFO, transports: [] })).toThrow(
      expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION })
    );
    expect(() =>
      validateLoggerConfiguration({ minLevel: LogLevel.INFO, transports: "no-array" as never })
    ).toThrow(expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION }));
  });

  it("rechaza un transporte sin write()", () => {
    expect(() =>
      validateLoggerConfiguration({ minLevel: LogLevel.INFO, transports: [{} as never] })
    ).toThrow(expect.objectContaining({ code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION }));
  });
});
