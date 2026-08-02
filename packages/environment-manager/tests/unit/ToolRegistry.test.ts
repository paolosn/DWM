import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../../src/ToolRegistry.js";
import { EnvironmentError } from "../../src/errors/EnvironmentError.js";
import { EnvironmentErrorCode } from "../../src/errors/EnvironmentErrorCode.js";
import type { ToolDetectorDefinition } from "../../src/ToolDetector.js";

function makeDefinition(overrides: Partial<ToolDetectorDefinition> = {}): ToolDetectorDefinition {
  return {
    id: "git",
    name: "Git",
    category: "vcs",
    candidates: [{ command: "git" }],
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("register/get/has/list", () => {
    registry.register(makeDefinition());
    expect(registry.has("git")).toBe(true);
    expect(registry.get("git")?.name).toBe("Git");
    expect(registry.list().map((d) => d.id)).toEqual(["git"]);
  });

  it("lanza ENVIRONMENT_DETECTOR_ALREADY_REGISTERED ante un id duplicado", () => {
    registry.register(makeDefinition());
    expect(() => registry.register(makeDefinition())).toThrowError(
      expect.objectContaining({
        code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_ALREADY_REGISTERED,
      })
    );
  });

  it("registerOrReplace sustituye un detector existente sin lanzar", () => {
    registry.register(makeDefinition());
    registry.registerOrReplace(makeDefinition({ name: "Git (actualizado)" }));
    expect(registry.get("git")?.name).toBe("Git (actualizado)");
  });

  it("require lanza ENVIRONMENT_DETECTOR_NOT_FOUND si no existe", () => {
    expect(() => registry.require("no-existe")).toThrowError(
      expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_DETECTOR_NOT_FOUND })
    );
    expect(() => registry.require("no-existe")).toThrowError(EnvironmentError);
  });

  it("unregister retira un detector", () => {
    registry.register(makeDefinition());
    registry.unregister("git");
    expect(registry.has("git")).toBe(false);
  });

  it("list ordena por id", () => {
    registry.register(makeDefinition({ id: "z" }));
    registry.register(makeDefinition({ id: "a" }));
    expect(registry.list().map((d) => d.id)).toEqual(["a", "z"]);
  });

  describe("validación de detectores", () => {
    it("rechaza id vacío", () => {
      expect(() => registry.register(makeDefinition({ id: "" }))).toThrowError(
        expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_INVALID_DETECTOR })
      );
    });

    it("rechaza name vacío", () => {
      expect(() => registry.register(makeDefinition({ name: "" }))).toThrowError(
        expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_INVALID_DETECTOR })
      );
    });

    it("rechaza candidates vacío", () => {
      expect(() => registry.register(makeDefinition({ candidates: [] }))).toThrowError(
        expect.objectContaining({ code: EnvironmentErrorCode.ENVIRONMENT_INVALID_DETECTOR })
      );
    });
  });
});
