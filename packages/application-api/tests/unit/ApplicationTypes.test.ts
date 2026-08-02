import { describe, expect, it } from "vitest";
import {
  isApiVersionCompatible,
  isApplicationCapability,
  APPLICATION_API_VERSION,
  ALL_APPLICATION_CAPABILITIES,
} from "../../src/ApplicationTypes.js";

describe("ApplicationTypes", () => {
  it("declara una versión pública con formato semver", () => {
    expect(APPLICATION_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("isApiVersionCompatible acepta versiones con el mismo MAJOR", () => {
    expect(isApiVersionCompatible("1.0.0", "1.0.0")).toBe(true);
    expect(isApiVersionCompatible("1.4.2", "1.0.0")).toBe(true);
  });

  it("isApiVersionCompatible rechaza un MAJOR distinto", () => {
    expect(isApiVersionCompatible("2.0.0", "1.0.0")).toBe(false);
  });

  it("isApiVersionCompatible rechaza formatos inválidos", () => {
    expect(isApiVersionCompatible("no-es-semver", "1.0.0")).toBe(false);
    expect(isApiVersionCompatible("1.0.0", "no-es-semver")).toBe(false);
  });

  it("isApplicationCapability reconoce únicamente capacidades válidas", () => {
    for (const capability of ALL_APPLICATION_CAPABILITIES) {
      expect(isApplicationCapability(capability)).toBe(true);
    }
    expect(isApplicationCapability("no-existe")).toBe(false);
    expect(isApplicationCapability(42)).toBe(false);
  });
});
