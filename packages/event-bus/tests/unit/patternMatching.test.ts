import { describe, it, expect } from "vitest";
import {
  EventPriority,
  compareEventPriority,
  isValidEventPriority,
} from "../../src/EventPriority.js";
import { matchesPattern, assertValidPattern } from "../../src/patternMatching.js";
import { EventBusErrorCode } from "../../src/errors/EventBusErrorCode.js";

describe("EventPriority", () => {
  it("ordena las prioridades de menor a mayor severidad", () => {
    expect(compareEventPriority(EventPriority.LOW, EventPriority.HIGH)).toBeLessThan(0);
    expect(compareEventPriority(EventPriority.CRITICAL, EventPriority.NORMAL)).toBeGreaterThan(0);
    expect(compareEventPriority(EventPriority.HIGH, EventPriority.HIGH)).toBe(0);
  });

  it("isValidEventPriority valida solo el catálogo", () => {
    expect(isValidEventPriority("high")).toBe(true);
    expect(isValidEventPriority("urgent")).toBe(false);
    expect(isValidEventPriority(1)).toBe(false);
  });
});

describe("matchesPattern", () => {
  it("coincide exactamente sin comodines", () => {
    expect(matchesPattern("user.created", "user.created")).toBe(true);
    expect(matchesPattern("user.created", "user.updated")).toBe(false);
  });

  it("* coincide con exactamente un segmento", () => {
    expect(matchesPattern("user.*", "user.created")).toBe(true);
    expect(matchesPattern("user.*", "user.created.extra")).toBe(false);
    expect(matchesPattern("*.created", "user.created")).toBe(true);
  });

  it("** coincide con cero o más segmentos", () => {
    expect(matchesPattern("user.**", "user.created")).toBe(true);
    expect(matchesPattern("user.**", "user.profile.updated")).toBe(true);
    expect(matchesPattern("user.**", "user")).toBe(true);
    expect(matchesPattern("**", "cualquier.cosa.aqui")).toBe(true);
    expect(matchesPattern("a.**.z", "a.b.c.z")).toBe(true);
    expect(matchesPattern("a.**.z", "a.z")).toBe(true);
  });

  it("assertValidPattern rechaza patrones vacíos o con segmentos vacíos", () => {
    expect(() => assertValidPattern("")).toThrow(
      expect.objectContaining({ code: EventBusErrorCode.EVENTBUS_INVALID_PATTERN })
    );
    expect(() => assertValidPattern("user..created")).toThrow(
      expect.objectContaining({ code: EventBusErrorCode.EVENTBUS_INVALID_PATTERN })
    );
  });

  it("assertValidPattern acepta patrones válidos", () => {
    expect(() => assertValidPattern("user.created")).not.toThrow();
    expect(() => assertValidPattern("**")).not.toThrow();
  });
});
