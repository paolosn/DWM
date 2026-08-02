import { LogLevel, isValidLogLevel } from "./LogLevel.js";
import type { LogTransport } from "./transports/LogTransport.js";
import { LoggerErrorCode } from "./errors/LoggerErrorCode.js";
import { createLoggerError } from "./errors/LoggerError.js";

export interface LoggerConfiguration {
  readonly minLevel: LogLevel;
  readonly transports: readonly LogTransport[];
  /** Invocado si un transporte falla al escribir; por defecto, no hace nada. */
  onTransportError?(transport: LogTransport, error: unknown): void;
}

export function validateLoggerConfiguration(config: LoggerConfiguration): void {
  if (!config || typeof config !== "object") {
    throw createLoggerError({
      code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
      message: "LoggerConfiguration es obligatoria y debe ser un objeto.",
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!isValidLogLevel(config.minLevel)) {
    throw createLoggerError({
      code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
      message: `LoggerConfiguration.minLevel no es un nivel válido: "${String(config.minLevel)}".`,
      origin: "configuration",
      recoverable: false,
    });
  }
  if (!Array.isArray(config.transports) || config.transports.length === 0) {
    throw createLoggerError({
      code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
      message: "LoggerConfiguration.transports debe ser un array con al menos un transporte.",
      origin: "configuration",
      recoverable: false,
    });
  }
  for (const transport of config.transports) {
    if (!transport || typeof transport.write !== "function") {
      throw createLoggerError({
        code: LoggerErrorCode.LOGGER_INVALID_CONFIGURATION,
        message: "LoggerConfiguration.transports contiene un transporte inválido (falta write()).",
        origin: "configuration",
        recoverable: false,
      });
    }
  }
}
