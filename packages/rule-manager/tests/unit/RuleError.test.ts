import { describe, it, expect } from "vitest";
import { RuleError, createRuleError } from "../../src/errors/RuleError.js";
import { RuleErrorCode } from "../../src/errors/RuleErrorCode.js";

describe("RuleError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createRuleError({
      code: RuleErrorCode.RULE_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(RuleError);
    expect(err.name).toBe("RuleError");
    expect(err.code).toBe(RuleErrorCode.RULE_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "RuleError",
      code: RuleErrorCode.RULE_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo RuleError si ya lo es", () => {
      const original = createRuleError({
        code: RuleErrorCode.RULE_WRITE_FAILED,
        message: "fallo",
        origin: "repository",
        recoverable: true,
      });
      const wrapped = RuleError.wrap(original, {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = RuleError.wrap(new Error("boom"), {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = RuleError.wrap("no es un error", {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de reglas");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = RuleError.wrap(new Error("interno"), {
        code: RuleErrorCode.RULE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
