import { describe, it, expect } from "vitest";
import {
  LoggerError,
  createLoggerError,
  LoggerErrorCode,
  LoggerManager,
  LoggerFactory,
  Logger,
  LogLevel,
  ConsoleTransport,
  FileTransport,
  JsonTransport,
} from "../../src/index.js";

describe("LoggerError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createLoggerError({
      code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
      message: "m",
      origin: "configuration",
      recoverable: false,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("LoggerError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo LoggerError si ya lo es", () => {
    const original = createLoggerError({
      code: LoggerErrorCode.LOGGER_TRANSPORT_WRITE_FAILED,
      message: "x",
      origin: "transport",
      recoverable: true,
    });
    const wrapped = LoggerError.wrap(original, {
      code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
      origin: "configuration",
      recoverable: false,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = LoggerError.wrap(new Error("nativo"), {
      code: LoggerErrorCode.LOGGER_TRANSPORT_WRITE_FAILED,
      origin: "transport",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = LoggerError.wrap("cadena", {
      code: LoggerErrorCode.LOGGER_TRANSPORT_WRITE_FAILED,
      origin: "transport",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el logger");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createLoggerError({
      code: LoggerErrorCode.LOGGER_TRANSPORT_DISPOSE_FAILED,
      message: "m",
      origin: "transport",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "LoggerError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/logger)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof LoggerManager).toBe("function");
    expect(typeof LoggerFactory).toBe("function");
    expect(typeof Logger).toBe("function");
    expect(typeof ConsoleTransport).toBe("function");
    expect(typeof FileTransport).toBe("function");
    expect(typeof JsonTransport).toBe("function");
    expect(LogLevel.INFO).toBe("info");
  });
});
