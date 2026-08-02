import { describe, it, expect } from "vitest";
import {
  SchedulerError,
  createSchedulerError,
  SchedulerErrorCode,
  Scheduler,
  SchedulerManager,
  emptySchedulerStatistics,
  resolveSchedulerConfiguration,
} from "../../src/index.js";

describe("SchedulerError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createSchedulerError({
      code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS,
      message: "m",
      origin: "task-options",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SchedulerError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo SchedulerError si ya lo es", () => {
    const original = createSchedulerError({
      code: SchedulerErrorCode.SCHEDULER_TASK_NOT_FOUND,
      message: "x",
      origin: "registry",
      recoverable: true,
    });
    const wrapped = SchedulerError.wrap(original, {
      code: SchedulerErrorCode.SCHEDULER_TASK_TIMEOUT,
      origin: "execution",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = SchedulerError.wrap(new Error("nativo"), {
      code: SchedulerErrorCode.SCHEDULER_TASK_EXECUTION_FAILED,
      origin: "execution",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = SchedulerError.wrap("cadena", {
      code: SchedulerErrorCode.SCHEDULER_TASK_EXECUTION_FAILED,
      origin: "execution",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el planificador");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createSchedulerError({
      code: SchedulerErrorCode.SCHEDULER_SHUTTING_DOWN,
      message: "m",
      origin: "lifecycle",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "SchedulerError", recoverable: true });
  });
});

describe("resolveSchedulerConfiguration / emptySchedulerStatistics", () => {
  it("aplica los valores por defecto", () => {
    expect(resolveSchedulerConfiguration({})).toEqual({
      maxConcurrency: 1,
      shutdownGraceMs: 30_000,
    });
  });

  it("respeta los valores explícitos", () => {
    expect(resolveSchedulerConfiguration({ maxConcurrency: 5, shutdownGraceMs: 1000 })).toEqual({
      maxConcurrency: 5,
      shutdownGraceMs: 1000,
    });
  });

  it("emptySchedulerStatistics() devuelve todos los contadores a cero", () => {
    expect(emptySchedulerStatistics()).toEqual({
      scheduledCount: 0,
      runningCount: 0,
      queuedCount: 0,
      totalStarted: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalRetries: 0,
    });
  });
});

describe("Punto de entrada público (@dwm/scheduler)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof Scheduler).toBe("function");
    expect(typeof SchedulerManager).toBe("function");
  });
});
