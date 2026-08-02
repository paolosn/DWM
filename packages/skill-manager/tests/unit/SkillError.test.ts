import { describe, it, expect } from "vitest";
import { SkillError, createSkillError } from "../../src/errors/SkillError.js";
import { SkillErrorCode } from "../../src/errors/SkillErrorCode.js";

describe("SkillError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createSkillError({
      code: SkillErrorCode.SKILL_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(SkillError);
    expect(err.name).toBe("SkillError");
    expect(err.code).toBe(SkillErrorCode.SKILL_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "SkillError",
      code: SkillErrorCode.SKILL_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo SkillError si ya lo es", () => {
      const original = createSkillError({
        code: SkillErrorCode.SKILL_WRITE_FAILED,
        message: "fallo",
        origin: "repository",
        recoverable: true,
      });
      const wrapped = SkillError.wrap(original, {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = SkillError.wrap(new Error("boom"), {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = SkillError.wrap("no es un error", {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de skills");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = SkillError.wrap(new Error("interno"), {
        code: SkillErrorCode.SKILL_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
