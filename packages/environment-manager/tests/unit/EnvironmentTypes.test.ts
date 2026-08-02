import { describe, it, expect } from "vitest";
import {
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  isToolCategory,
  normalizePlatform,
} from "../../src/EnvironmentTypes.js";

describe("normalizePlatform", () => {
  it("traduce los valores de process.platform a la plataforma normalizada", () => {
    expect(normalizePlatform("win32")).toBe("windows");
    expect(normalizePlatform("darwin")).toBe("macos");
    expect(normalizePlatform("linux")).toBe("linux");
    expect(normalizePlatform("freebsd")).toBe("other");
  });
});

describe("isToolCategory", () => {
  it("acepta únicamente el catálogo cerrado", () => {
    for (const category of TOOL_CATEGORIES) expect(isToolCategory(category)).toBe(true);
    expect(isToolCategory("desconocida")).toBe(false);
    expect(isToolCategory(42)).toBe(false);
  });
});

describe("catálogos cerrados", () => {
  it("TOOL_CATEGORIES y TOOL_STATUSES tienen entradas únicas", () => {
    expect(new Set(TOOL_CATEGORIES).size).toBe(TOOL_CATEGORIES.length);
    expect(new Set(TOOL_STATUSES).size).toBe(TOOL_STATUSES.length);
  });
});
