import { describe, it, expect } from "vitest";
import { VersionParser } from "../../src/VersionParser.js";

describe("VersionParser", () => {
  const parser = new VersionParser();

  it("extrae versión completa MAJOR.MINOR.PATCH de salidas típicas", () => {
    expect(parser.parse("git version 2.43.0")).toEqual({
      raw: "2.43.0",
      major: 2,
      minor: 43,
      patch: 0,
    });
    expect(parser.parse("v20.11.0")).toEqual({ raw: "20.11.0", major: 20, minor: 11, patch: 0 });
    expect(parser.parse("Python 3.11.6")).toEqual({ raw: "3.11.6", major: 3, minor: 11, patch: 6 });
  });

  it("extrae versión con solo MAJOR o MAJOR.MINOR", () => {
    expect(parser.parse("herramienta 7")).toEqual({ raw: "7", major: 7 });
    expect(parser.parse("herramienta 7.2")).toEqual({ raw: "7.2", major: 7, minor: 2 });
  });

  it("extrae versión con prerelease", () => {
    expect(parser.parse("herramienta 1.2.3-beta.1")).toEqual({
      raw: "1.2.3-beta.1",
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: "beta.1",
    });
  });

  it("ignora texto adicional alrededor del número de versión", () => {
    const result = parser.parse("Docker version 24.0.7, build afdd53b");
    expect(result?.raw).toBe("24.0.7");
    expect(result?.major).toBe(24);
  });

  it("devuelve undefined si no hay nada con forma de versión", () => {
    expect(parser.parse("sin ningún número aquí")).toBeUndefined();
    expect(parser.parse("")).toBeUndefined();
  });
});
