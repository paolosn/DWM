import { describe, it, expect } from "vitest";
import { parseCronExpression, getNextCronOccurrence } from "../../src/cron.js";
import { SchedulerErrorCode } from "../../src/errors/SchedulerErrorCode.js";

describe("parseCronExpression", () => {
  it("analiza una expresión con comodines", () => {
    const parsed = parseCronExpression("* * * * *");
    expect(parsed.minute.size).toBe(60);
    expect(parsed.hour.size).toBe(24);
  });

  it("analiza listas, rangos y pasos", () => {
    const parsed = parseCronExpression("0,30 9-11 * */2 1");
    expect([...parsed.minute].sort((a, b) => a - b)).toEqual([0, 30]);
    expect([...parsed.hour].sort((a, b) => a - b)).toEqual([9, 10, 11]);
    expect([...parsed.month].sort((a, b) => a - b)).toEqual([1, 3, 5, 7, 9, 11]);
    expect([...parsed.dayOfWeek]).toEqual([1]);
  });

  it("rechaza expresiones con un número de campos incorrecto", () => {
    expect(() => parseCronExpression("* * * *")).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION })
    );
  });

  it("rechaza valores fuera de rango o mal formados", () => {
    expect(() => parseCronExpression("60 * * * *")).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION })
    );
    expect(() => parseCronExpression("*/0 * * * *")).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION })
    );
    expect(() => parseCronExpression("5-2 * * * *")).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION })
    );
  });
});

describe("getNextCronOccurrence", () => {
  it("calcula la siguiente medianoche exacta", () => {
    const from = new Date("2026-01-01T10:00:00.000Z");
    const next = getNextCronOccurrence("0 0 * * *", from);
    expect(next.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("calcula la siguiente ocurrencia con paso de minutos", () => {
    const from = new Date("2026-01-01T10:03:00.000Z");
    const next = getNextCronOccurrence("*/5 * * * *", from);
    expect(next.toISOString()).toBe("2026-01-01T10:05:00.000Z");
  });

  it("respeta el día de la semana", () => {
    // 2026-01-01 es jueves (día 4); buscamos el próximo lunes (día 1) a las 09:00.
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = getNextCronOccurrence("0 9 * * 1", from);
    expect(next.getUTCDay()).toBe(1);
    expect(next.getUTCHours()).toBe(9);
  });

  it("lanza SCHEDULER_INVALID_CRON_EXPRESSION si no hay ninguna ocurrencia posible", () => {
    // El 31 de febrero nunca existe: día de mes 31 combinado con mes 2.
    expect(() => getNextCronOccurrence("0 0 31 2 *", new Date("2026-01-01T00:00:00.000Z"))).toThrow(
      expect.objectContaining({ code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION })
    );
  });
});
