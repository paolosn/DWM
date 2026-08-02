import { ConsoleTransport, Logger, LoggerFactory, LogLevel } from "@dwm/logger";

/**
 * Módulo 32 — Desktop Application. Logger por defecto del proceso
 * principal: nivel `info` en producción (silencia `debug`/`trace`, que son
 * ruidosos en un empaquetado de escritorio) y salida por consola, visible
 * en la terminal de desarrollo y en los logs que Electron redirige.
 */
export function createDesktopLogger(minLevel: LogLevel = LogLevel.INFO): Logger {
  const factory = new LoggerFactory({
    minLevel,
    transports: [new ConsoleTransport()],
  });
  return factory.createLogger("desktop-app");
}
