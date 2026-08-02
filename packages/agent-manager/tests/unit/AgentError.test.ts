import { describe, it, expect } from "vitest";
import { AgentError, createAgentError } from "../../src/errors/AgentError.js";
import { AgentErrorCode } from "../../src/errors/AgentErrorCode.js";

describe("AgentError", () => {
  it("crea un error con forma completa y serializa vía toJSON()", () => {
    const err = createAgentError({
      code: AgentErrorCode.AGENT_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(AgentError);
    expect(err.name).toBe("AgentError");
    expect(err.code).toBe(AgentErrorCode.AGENT_NOT_FOUND);
    expect(err.origin).toBe("repository");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "AgentError",
      code: AgentErrorCode.AGENT_NOT_FOUND,
      message: "no existe",
      origin: "repository",
      recoverable: true,
    });
  });

  describe("wrap()", () => {
    it("devuelve el mismo AgentError si ya lo es", () => {
      const original = createAgentError({
        code: AgentErrorCode.AGENT_WRITE_FAILED,
        message: "fallo",
        origin: "repository",
        recoverable: true,
      });
      const wrapped = AgentError.wrap(original, {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped).toBe(original);
    });

    it("envuelve un Error nativo preservando su mensaje por defecto", () => {
      const wrapped = AgentError.wrap(new Error("boom"), {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("boom");
      expect(wrapped.cause).toBeInstanceOf(Error);
    });

    it("usa un mensaje por defecto cuando la causa no es un Error", () => {
      const wrapped = AgentError.wrap("no es un error", {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
      });
      expect(wrapped.message).toBe("Error desconocido en el gestor de agentes");
    });

    it("permite forzar un mensaje explícito", () => {
      const wrapped = AgentError.wrap(new Error("interno"), {
        code: AgentErrorCode.AGENT_READ_FAILED,
        origin: "repository",
        recoverable: true,
        message: "mensaje explícito",
      });
      expect(wrapped.message).toBe("mensaje explícito");
    });
  });
});
