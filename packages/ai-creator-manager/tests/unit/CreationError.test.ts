import { describe, expect, it } from "vitest";
import {
  CreationError,
  createCreationError,
  isNotFoundError,
} from "../../src/errors/CreationError.js";
import { CreationErrorCode } from "../../src/errors/CreationErrorCode.js";

describe("CreationError", () => {
  it("expone code, origin, recoverable y timestamp", () => {
    const err = createCreationError({
      code: CreationErrorCode.CREATION_CONFLICT,
      message: "conflicto",
      origin: "conflict",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(CreationError);
    expect(err.code).toBe(CreationErrorCode.CREATION_CONFLICT);
    expect(err.origin).toBe("conflict");
    expect(err.recoverable).toBe(true);
    expect(typeof err.timestamp).toBe("string");
    expect(err.toJSON()).toMatchObject({
      name: "CreationError",
      code: CreationErrorCode.CREATION_CONFLICT,
      message: "conflicto",
      origin: "conflict",
      recoverable: true,
    });
  });

  it("wrap devuelve el mismo error si ya es un CreationError", () => {
    const original = createCreationError({
      code: CreationErrorCode.CREATION_EXECUTION_FAILED,
      message: "fallo",
      origin: "execution",
      recoverable: false,
    });
    const wrapped = CreationError.wrap(original, {
      code: CreationErrorCode.CREATION_CONFLICT,
      origin: "conflict",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap envuelve un error nativo preservando su mensaje", () => {
    const wrapped = CreationError.wrap(new Error("nativo"), {
      code: CreationErrorCode.CREATION_EXECUTION_FAILED,
      origin: "execution",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
    expect(wrapped.cause).toBeInstanceOf(Error);
  });

  it("wrap usa un mensaje por defecto para valores no-Error", () => {
    const wrapped = CreationError.wrap("boom", {
      code: CreationErrorCode.CREATION_EXECUTION_FAILED,
      origin: "execution",
      recoverable: true,
    });
    expect(wrapped.message).toContain("gestor de creación por IA");
  });

  it("wrap respeta un mensaje explícito", () => {
    const wrapped = CreationError.wrap(new Error("original"), {
      code: CreationErrorCode.CREATION_EXECUTION_FAILED,
      origin: "execution",
      recoverable: true,
      message: "mensaje propio",
    });
    expect(wrapped.message).toBe("mensaje propio");
  });
});

describe("isNotFoundError", () => {
  it("reconoce cualquier código terminado en _NOT_FOUND", () => {
    expect(isNotFoundError({ code: "AGENT_NOT_FOUND" })).toBe(true);
    expect(isNotFoundError({ code: "SKILL_NOT_FOUND" })).toBe(true);
  });

  it("devuelve falso para otros valores", () => {
    expect(isNotFoundError({ code: "OTHER" })).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError("no")).toBe(false);
    expect(isNotFoundError({})).toBe(false);
  });
});
