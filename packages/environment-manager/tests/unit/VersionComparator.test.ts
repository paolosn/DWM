import { describe, it, expect } from "vitest";
import { VersionComparator } from "../../src/VersionComparator.js";

describe("VersionComparator", () => {
  const comparator = new VersionComparator();

  describe("compare()", () => {
    it("compara versiones por major/minor/patch, con componentes ausentes tratados como 0", () => {
      expect(comparator.compare("1.0.0", "2.0.0")).toBe(-1);
      expect(comparator.compare("2.0.0", "1.0.0")).toBe(1);
      expect(comparator.compare("1.2.0", "1.10.0")).toBe(-1);
      expect(comparator.compare("1.2.3", "1.2.3")).toBe(0);
      expect(comparator.compare("2", "2.0.0")).toBe(0);
      expect(comparator.compare("2.1", "2.1.5")).toBe(-1);
    });

    it("trata una versión sin prerelease como posterior a la misma versión con prerelease", () => {
      expect(comparator.compare("1.0.0", "1.0.0-rc.1")).toBe(1);
      expect(comparator.compare("1.0.0-rc.1", "1.0.0")).toBe(-1);
      expect(comparator.compare("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
      expect(comparator.compare("1.0.0-rc.1", "1.0.0-rc.1")).toBe(0);
    });

    it("acepta tanto texto crudo como ToolVersion ya parseado", () => {
      expect(comparator.compare({ raw: "1.0.0", major: 1, minor: 0, patch: 0 }, "1.0.0")).toBe(0);
    });

    it("lanza si alguna de las dos versiones no se puede interpretar", () => {
      expect(() => comparator.compare("no-es-version", "1.0.0")).toThrow(RangeError);
    });
  });

  describe("satisfiesMinimum()", () => {
    it("verdadero cuando la versión es igual o posterior al mínimo", () => {
      expect(comparator.satisfiesMinimum("2.43.0", "2.40.0")).toBe(true);
      expect(comparator.satisfiesMinimum("2.40.0", "2.40.0")).toBe(true);
      expect(comparator.satisfiesMinimum("2.39.0", "2.40.0")).toBe(false);
    });
  });
});
