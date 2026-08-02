import { vi } from "vitest";
import type { Logger } from "@dwm/logger";

export function createFakeLogger(): Logger {
  const logger: Logger = {
    trace: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    fatal: vi.fn().mockResolvedValue(undefined),
    // `Logger` es una clase real con `child()`/`withCorrelationId()` además
    // de los métodos de nivel; varios managers de dominio los llaman para
    // obtener un logger con contexto adicional. Sin ellos, cualquier
    // manager real que los use lanza un `TypeError` crudo en tiempo de
    // ejecución que Application API normaliza como "error interno"
    // genérico, ocultando la causa real (bug encontrado en el Módulo 34
    // al escribir la primera prueba de integración con managers reales).
    child: vi.fn(() => logger),
    withCorrelationId: vi.fn(() => logger),
  } as unknown as Logger;
  return logger;
}
