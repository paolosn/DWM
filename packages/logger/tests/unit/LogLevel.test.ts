import { describe, it, expect } from "vitest";
import { LogLevel, compareLevels, meetsMinLevel, isValidLogLevel } from "../../src/LogLevel.js";

describe("LogLevel", () => {
  it("ordena los niveles de menor a mayor severidad", () => {
    expect(compareLevels(LogLevel.TRACE, LogLevel.DEBUG)).toBeLessThan(0);
    expect(compareLevels(LogLevel.FATAL, LogLevel.ERROR)).toBeGreaterThan(0);
    expect(compareLevels(LogLevel.INFO, LogLevel.INFO)).toBe(0);
  });

  it("meetsMinLevel respeta el umbral mínimo", () => {
    expect(meetsMinLevel(LogLevel.WARN, LogLevel.INFO)).toBe(true);
    expect(meetsMinLevel(LogLevel.DEBUG, LogLevel.INFO)).toBe(false);
    expect(meetsMinLevel(LogLevel.INFO, LogLevel.INFO)).toBe(true);
  });

  it("isValidLogLevel valida solo los niveles del catálogo", () => {
    expect(isValidLogLevel("info")).toBe(true);
    expect(isValidLogLevel("trace")).toBe(true);
    expect(isValidLogLevel("verbose")).toBe(false);
    expect(isValidLogLevel(42)).toBe(false);
    expect(isValidLogLevel(undefined)).toBe(false);
  });
});
