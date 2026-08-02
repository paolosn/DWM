import { describe, it, expect } from "vitest";
import { computeBackoffDelay } from "../../src/backoff.js";
import { validateTaskOptions } from "../../src/TaskOptions.js";
import { SchedulerErrorCode } from "../../src/errors/SchedulerErrorCode.js";

describe("computeBackoffDelay", () => {
  it("aplica el factor exponencial por defecto (2)", () => {
    expect(computeBackoffDelay({ baseDelayMs: 100 }, 1)).toBe(100);
    expect(computeBackoffDelay({ baseDelayMs: 100 }, 2)).toBe(200);
    expect(computeBackoffDelay({ baseDelayMs: 100 }, 3)).toBe(400);
  });

  it("respeta un factor personalizado", () => {
    expect(computeBackoffDelay({ baseDelayMs: 10, factor: 3 }, 3)).toBe(90);
  });

  it("respeta el retardo máximo", () => {
    expect(computeBackoffDelay({ baseDelayMs: 100, maxDelayMs: 150 }, 5)).toBe(150);
  });
});

describe("validateTaskOptions", () => {
  it("acepta opciones válidas", () => {
    expect(() => validateTaskOptions({})).not.toThrow();
    expect(() => validateTaskOptions({ delayMs: 0, intervalMs: 1000, priority: 1 })).not.toThrow();
  });

  it("rechaza delayMs negativo", () => {
    expect(() => validateTaskOptions({ delayMs: -1 })).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS })
    );
  });

  it("rechaza intervalMs <= 0", () => {
    expect(() => validateTaskOptions({ intervalMs: 0 })).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS })
    );
  });

  it("rechaza declarar intervalMs y cronExpression a la vez", () => {
    expect(() => validateTaskOptions({ intervalMs: 1000, cronExpression: "* * * * *" })).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS })
    );
  });

  it("rechaza timeoutMs <= 0", () => {
    expect(() => validateTaskOptions({ timeoutMs: 0 })).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS })
    );
  });

  it("rechaza retry.maxAttempts < 1", () => {
    expect(() =>
      validateTaskOptions({ retry: { maxAttempts: 0, backoff: { baseDelayMs: 10 } } })
    ).toThrow(expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_TASK_OPTIONS }));
  });
});
