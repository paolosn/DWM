import { Logger } from "./Logger.js";
import type { LoggerConfiguration } from "./LoggerConfiguration.js";
import { validateLoggerConfiguration } from "./LoggerConfiguration.js";

/** Fábrica de loggers a partir de una única `LoggerConfiguration` compartida. */
export class LoggerFactory {
  constructor(private readonly config: LoggerConfiguration) {
    validateLoggerConfiguration(config);
  }

  createLogger(name: string, context?: Record<string, unknown>): Logger {
    return new Logger(name, this.config, context ?? {});
  }
}
