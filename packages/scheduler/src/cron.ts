import { SchedulerErrorCode } from "./errors/SchedulerErrorCode.js";
import { createSchedulerError } from "./errors/SchedulerError.js";

interface FieldRange {
  readonly min: number;
  readonly max: number;
}

const FIELD_RANGES: readonly FieldRange[] = [
  { min: 0, max: 59 }, // minuto
  { min: 0, max: 23 }, // hora
  { min: 1, max: 31 }, // día del mes
  { min: 1, max: 12 }, // mes
  { min: 0, max: 6 }, // día de la semana (0 = domingo)
];

function parseCronField(field: string, range: FieldRange, expression: string): ReadonlySet<number> {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const [base, stepText] = part.split("/");
    const step = stepText !== undefined ? Number.parseInt(stepText, 10) : 1;
    if (stepText !== undefined && (!Number.isInteger(step) || step <= 0)) {
      throw invalidCron(expression);
    }

    let start = range.min;
    let end = range.max;

    if (base !== "*") {
      if (base!.includes("-")) {
        const [fromText, toText] = base!.split("-");
        start = Number.parseInt(fromText!, 10);
        end = Number.parseInt(toText!, 10);
      } else {
        start = Number.parseInt(base!, 10);
        end = start;
      }
    }

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start > end ||
      start < range.min ||
      end > range.max
    ) {
      throw invalidCron(expression);
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }
  return values;
}

function invalidCron(expression: string) {
  return createSchedulerError({
    code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION,
    message: `Expresión cron inválida: "${expression}".`,
    origin: "cron",
    recoverable: true,
  });
}

export interface ParsedCron {
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dayOfMonth: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  readonly dayOfWeek: ReadonlySet<number>;
}

/** Analiza una expresión cron de 5 campos ("minuto hora día-mes mes día-semana"). */
export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw invalidCron(expression);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    minute: parseCronField(minute, FIELD_RANGES[0]!, expression),
    hour: parseCronField(hour, FIELD_RANGES[1]!, expression),
    dayOfMonth: parseCronField(dayOfMonth, FIELD_RANGES[2]!, expression),
    month: parseCronField(month, FIELD_RANGES[3]!, expression),
    dayOfWeek: parseCronField(dayOfWeek, FIELD_RANGES[4]!, expression),
  };
}

const MAX_MINUTES_SEARCH = 4 * 366 * 24 * 60; // hasta ~4 años

/** Calcula la siguiente ocurrencia (en UTC) de `expression` estrictamente posterior a `from`. */
export function getNextCronOccurrence(expression: string, from: Date): Date {
  const parsed = parseCronExpression(expression);

  const candidate = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes() + 1,
      0,
      0
    )
  );

  for (let i = 0; i < MAX_MINUTES_SEARCH; i += 1) {
    const minute = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dayOfMonth = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const dayOfWeek = candidate.getUTCDay();

    if (
      parsed.minute.has(minute) &&
      parsed.hour.has(hour) &&
      parsed.dayOfMonth.has(dayOfMonth) &&
      parsed.month.has(month) &&
      parsed.dayOfWeek.has(dayOfWeek)
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw createSchedulerError({
    code: SchedulerErrorCode.SCHEDULER_INVALID_CRON_EXPRESSION,
    message: `No se encontró ninguna ocurrencia futura para la expresión cron "${expression}" dentro del horizonte de búsqueda.`,
    origin: "cron",
    recoverable: true,
  });
}
