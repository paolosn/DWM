import { describe, it, expect } from "vitest";
import { matchesGlob, isExcluded } from "../../src/glob.js";

describe("matchesGlob", () => {
  it("coincide exactamente sin comodines", () => {
    expect(matchesGlob("README.md", "README.md")).toBe(true);
    expect(matchesGlob("README.md", "other.md")).toBe(false);
  });

  it("* coincide con cualquier secuencia sin '/'", () => {
    expect(matchesGlob("*.log", "app.log")).toBe(true);
    expect(matchesGlob("*.log", "dir/app.log")).toBe(false);
  });

  it("** coincide con cualquier secuencia incluyendo '/'", () => {
    expect(matchesGlob("node_modules/**", "node_modules/pkg/index.js")).toBe(true);
    expect(matchesGlob("node_modules/**", "node_modules/")).toBe(true);
    expect(matchesGlob("node_modules/**", "src/index.js")).toBe(false);
  });
});

describe("isExcluded", () => {
  it("devuelve true si algún patrón coincide", () => {
    expect(isExcluded("dist/index.js", ["node_modules/**", "dist/**"])).toBe(true);
    expect(isExcluded("src/index.js", ["node_modules/**", "dist/**"])).toBe(false);
  });
});
