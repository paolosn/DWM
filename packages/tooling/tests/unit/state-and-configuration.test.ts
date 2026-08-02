import { describe, it, expect } from "vitest";
import { isToolStateTransitionAllowed } from "../../src/ToolState.js";
import {
  validateToolConfiguration,
  defaultToolConfiguration,
} from "../../src/ToolConfiguration.js";
import { ToolErrorCode } from "../../src/errors/ToolErrorCode.js";

describe("isToolStateTransitionAllowed", () => {
  it("permite el ciclo de vida normal", () => {
    expect(isToolStateTransitionAllowed("registered", "initialized")).toBe(true);
    expect(isToolStateTransitionAllowed("initialized", "active")).toBe(true);
    expect(isToolStateTransitionAllowed("active", "inactive")).toBe(true);
    expect(isToolStateTransitionAllowed("inactive", "active")).toBe(true);
  });

  it("permite el reinicio a 'registered' para soportar la recarga", () => {
    expect(isToolStateTransitionAllowed("inactive", "registered")).toBe(true);
    expect(isToolStateTransitionAllowed("initialized", "registered")).toBe(true);
    expect(isToolStateTransitionAllowed("error", "registered")).toBe(true);
  });

  it("rechaza transiciones no permitidas", () => {
    expect(isToolStateTransitionAllowed("registered", "active")).toBe(false);
    expect(isToolStateTransitionAllowed("removed", "registered")).toBe(false);
    expect(isToolStateTransitionAllowed("active", "registered")).toBe(false);
  });
});

describe("validateToolConfiguration", () => {
  it("acepta la configuración por defecto", () => {
    expect(() => validateToolConfiguration(defaultToolConfiguration())).not.toThrow();
  });

  it("rechaza config ausente", () => {
    expect(() => validateToolConfiguration(null as never)).toThrow(
      expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION })
    );
  });

  it("rechaza enabled no booleano", () => {
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), enabled: "si" as never })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
  });

  it("rechaza priority no numérico", () => {
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), priority: "alta" as never })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
  });

  it("rechaza dependencies que no sea un array de cadenas", () => {
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), dependencies: "x" as never })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), dependencies: [1] as never })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
  });

  it("rechaza exclusiveGroup que no sea una cadena", () => {
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), exclusiveGroup: 1 as never })
    ).toThrow(expect.objectContaining({ code: ToolErrorCode.TOOL_INVALID_CONFIGURATION }));
  });

  it("acepta exclusiveGroup como cadena", () => {
    expect(() =>
      validateToolConfiguration({ ...defaultToolConfiguration(), exclusiveGroup: "editor" })
    ).not.toThrow();
  });
});
