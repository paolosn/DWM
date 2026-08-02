import { describe, it, expect } from "vitest";
import { isStateTransitionAllowed } from "../../src/AdapterState.js";
import {
  validateAdapterConfiguration,
  defaultAdapterConfiguration,
} from "../../src/AdapterConfiguration.js";
import { AdapterErrorCode } from "../../src/errors/AdapterErrorCode.js";

describe("isStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal", () => {
    expect(isStateTransitionAllowed("registered", "initialized")).toBe(true);
    expect(isStateTransitionAllowed("initialized", "active")).toBe(true);
    expect(isStateTransitionAllowed("active", "inactive")).toBe(true);
    expect(isStateTransitionAllowed("inactive", "active")).toBe(true);
  });

  it("permite el reinicio a 'registered' para soportar la recarga", () => {
    expect(isStateTransitionAllowed("inactive", "registered")).toBe(true);
    expect(isStateTransitionAllowed("initialized", "registered")).toBe(true);
    expect(isStateTransitionAllowed("error", "registered")).toBe(true);
  });

  it("rechaza transiciones no permitidas", () => {
    expect(isStateTransitionAllowed("registered", "active")).toBe(false);
    expect(isStateTransitionAllowed("disposed", "registered")).toBe(false);
    expect(isStateTransitionAllowed("active", "registered")).toBe(false);
  });
});

describe("validateAdapterConfiguration", () => {
  it("acepta la configuración por defecto", () => {
    expect(() => validateAdapterConfiguration(defaultAdapterConfiguration())).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateAdapterConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION })
    );
  });

  it("rechaza enabled no booleano", () => {
    expect(() =>
      validateAdapterConfiguration({ ...defaultAdapterConfiguration(), enabled: "si" as never })
    ).toThrow(expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION }));
  });

  it("rechaza priority no numérico", () => {
    expect(() =>
      validateAdapterConfiguration({ ...defaultAdapterConfiguration(), priority: "alta" as never })
    ).toThrow(expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION }));
  });

  it("rechaza dependencies que no sea un array de cadenas", () => {
    expect(() =>
      validateAdapterConfiguration({ ...defaultAdapterConfiguration(), dependencies: "x" as never })
    ).toThrow(expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION }));
    expect(() =>
      validateAdapterConfiguration({ ...defaultAdapterConfiguration(), dependencies: [1] as never })
    ).toThrow(expect.objectContaining({ code: AdapterErrorCode.ADAPTER_INVALID_CONFIGURATION }));
  });
});
