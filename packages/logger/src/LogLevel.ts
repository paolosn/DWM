/** Niveles de log soportados, ordenados de menor a mayor severidad. */
export enum LogLevel {
  TRACE = "trace",
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  FATAL = "fatal",
}

const SEVERITY: Record<LogLevel, number> = {
  [LogLevel.TRACE]: 0,
  [LogLevel.DEBUG]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.WARN]: 3,
  [LogLevel.ERROR]: 4,
  [LogLevel.FATAL]: 5,
};

/** Compara la severidad de dos niveles: negativo si `a` < `b`, cero si iguales, positivo si `a` > `b`. */
export function compareLevels(a: LogLevel, b: LogLevel): number {
  return SEVERITY[a] - SEVERITY[b];
}

/** Indica si `level` cumple o supera el umbral mínimo `minLevel`. */
export function meetsMinLevel(level: LogLevel, minLevel: LogLevel): boolean {
  return compareLevels(level, minLevel) >= 0;
}

export function isValidLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && Object.values(LogLevel).includes(value as LogLevel);
}
