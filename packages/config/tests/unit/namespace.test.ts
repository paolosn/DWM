import { describe, it, expect } from "vitest";
import { assertValidNamespace } from "../../src/namespace.js";
import { ConfigErrorCode } from "../../src/errors/ConfigErrorCode.js";

describe("assertValidNamespace", () => {
  it("acepta identificadores válidos", () => {
    expect(() => assertValidNamespace("secrets")).not.toThrow();
    expect(() => assertValidNamespace("ai-manager")).not.toThrow();
    expect(() => assertValidNamespace("tool.git")).not.toThrow();
    expect(() => assertValidNamespace("a_b_1")).not.toThrow();
  });

  it("rechaza namespace vacío o no-cadena", () => {
    expect(() => assertValidNamespace("")).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
    expect(() => assertValidNamespace(undefined as never)).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
  });

  it("rechaza caracteres no seguros y traversal de ruta", () => {
    expect(() => assertValidNamespace("../escape")).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
    expect(() => assertValidNamespace("a/b")).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
    expect(() => assertValidNamespace("a b")).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
  });

  it("rechaza '..' aunque el resto de caracteres sean válidos según la expresión regular", () => {
    expect(() => assertValidNamespace("a..b")).toThrow(
      expect.objectContaining({ code: ConfigErrorCode.CONFIG_INVALID_NAMESPACE })
    );
  });
});
