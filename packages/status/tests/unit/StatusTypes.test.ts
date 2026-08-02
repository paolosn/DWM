import { describe, it, expect } from "vitest";
import { worstStatusLevel, makeStatusReport } from "../../src/StatusTypes.js";

describe("worstStatusLevel", () => {
  it("ERROR es siempre el más severo", () => {
    expect(worstStatusLevel("ERROR", "OK")).toBe("ERROR");
    expect(worstStatusLevel("OK", "ERROR")).toBe("ERROR");
    expect(worstStatusLevel("ERROR", "WARNING")).toBe("ERROR");
  });

  it("WARNING es más severo que UNKNOWN y OK", () => {
    expect(worstStatusLevel("WARNING", "UNKNOWN")).toBe("WARNING");
    expect(worstStatusLevel("WARNING", "OK")).toBe("WARNING");
  });

  it("UNKNOWN es más severo que OK", () => {
    expect(worstStatusLevel("UNKNOWN", "OK")).toBe("UNKNOWN");
  });

  it("OK y OK se mantienen en OK", () => {
    expect(worstStatusLevel("OK", "OK")).toBe("OK");
  });
});

describe("makeStatusReport", () => {
  it("construye un informe con marca de tiempo y sin detail si no se indica", () => {
    const report = makeStatusReport("p1", "OK", "todo bien");
    expect(report.providerId).toBe("p1");
    expect(report.level).toBe("OK");
    expect(report.message).toBe("todo bien");
    expect(typeof report.checkedAt).toBe("string");
    expect(report.detail).toBeUndefined();
  });

  it("incluye detail si se indica", () => {
    const report = makeStatusReport("p1", "WARNING", "cuidado", { total: 3 });
    expect(report.detail).toEqual({ total: 3 });
  });
});
