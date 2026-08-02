import { describe, it, expect } from "vitest";
import { KnowledgeError, createKnowledgeError } from "../../src/errors/KnowledgeError.js";
import { KnowledgeErrorCode } from "../../src/errors/KnowledgeErrorCode.js";

describe("KnowledgeError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createKnowledgeError({
      code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(KnowledgeError);
    expect(err.name).toBe("KnowledgeError");
    expect(err.code).toBe(KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "KnowledgeError",
      code: KnowledgeErrorCode.KNOWLEDGE_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo KnowledgeError si ya lo es", () => {
      const original = createKnowledgeError({
        code: KnowledgeErrorCode.KNOWLEDGE_WRITE_FAILED,
        message: "fallo",
        origin: "repository",
        recoverable: true,
      });
      const wrapped = KnowledgeError.wrap(original, {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = KnowledgeError.wrap(new Error("boom"), {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = KnowledgeError.wrap("no es un error", {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de conocimiento");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = KnowledgeError.wrap(new Error("interno"), {
        code: KnowledgeErrorCode.KNOWLEDGE_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
