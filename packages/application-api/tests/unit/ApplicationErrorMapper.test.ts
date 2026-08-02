import { describe, expect, it } from "vitest";
import { mapErrorToPayload } from "../../src/ApplicationErrorMapper.js";
import { createApplicationError } from "../../src/errors/ApplicationError.js";
import { ApplicationErrorCode } from "../../src/errors/ApplicationErrorCode.js";

describe("mapErrorToPayload", () => {
  it("normaliza un ApplicationError preservando código, categoría y retryable", () => {
    const err = createApplicationError({
      code: ApplicationErrorCode.APP_PERMISSION_DENIED,
      message: "denegado",
      origin: "permission",
      category: "permission",
      retryable: false,
      recoverable: true,
    });
    const payload = mapErrorToPayload(err);
    expect(payload).toEqual({
      code: "APP_PERMISSION_DENIED",
      message: "denegado",
      category: "permission",
      retryable: false,
    });
  });

  it("reconoce por duck-typing un error de dominio de otro paquete (p. ej. AgentError)", () => {
    const domainError = {
      name: "AgentError",
      code: "AGENT_NOT_FOUND",
      message: "No existe el agente x",
      recoverable: true,
    };
    const payload = mapErrorToPayload(domainError);
    expect(payload.code).toBe("AGENT_NOT_FOUND");
    expect(payload.category).toBe("not-found");
    expect(payload.retryable).toBe(true);
  });

  it("clasifica categorías a partir de patrones conocidos en el código", () => {
    expect(mapErrorToPayload({ code: "X_ALREADY_EXISTS", message: "m" }).category).toBe("conflict");
    expect(mapErrorToPayload({ code: "X_PERMISSION_DENIED", message: "m" }).category).toBe(
      "permission"
    );
    expect(mapErrorToPayload({ code: "X_CANCELLED", message: "m" }).category).toBe("cancelled");
    expect(mapErrorToPayload({ code: "X_UNAVAILABLE", message: "m" }).category).toBe("unavailable");
    expect(mapErrorToPayload({ code: "X_INVALID_FIELD", message: "m" }).category).toBe(
      "validation"
    );
    expect(mapErrorToPayload({ code: "X_SOMETHING_ELSE", message: "m" }).category).toBe("internal");
  });

  it("nunca expone el stack trace de un error nativo desconocido", () => {
    const err = new Error("mensaje interno con detalles de implementación y ruta /etc/secret");
    const payload = mapErrorToPayload(err);
    expect(payload.code).toBe("APP_INTERNAL_ERROR");
    expect(payload.message).not.toContain("/etc/secret");
    expect(JSON.stringify(payload)).not.toContain("at ");
  });

  it("sanea detalles que contengan claves sensibles (secrets/tokens/passwords)", () => {
    const err = createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: "payload inválido",
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
      details: {
        field: "apiKey",
        apiKey: "sk-super-secreto",
        password: "hunter2",
        token: "abc123",
        safeValue: "esto sí se puede mostrar",
      },
    });
    const payload = mapErrorToPayload(err);
    expect(payload.details).toBeDefined();
    expect(payload.details).not.toHaveProperty("apiKey");
    expect(payload.details).not.toHaveProperty("password");
    expect(payload.details).not.toHaveProperty("token");
    expect(payload.details?.["field"]).toBe("apiKey");
    expect(payload.details?.["safeValue"]).toBe("esto sí se puede mostrar");
  });

  it("trunca valores de texto muy largos dentro de los detalles", () => {
    const err = createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: "payload inválido",
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
      details: { longValue: "x".repeat(5000) },
    });
    const payload = mapErrorToPayload(err);
    expect((payload.details?.["longValue"] as string).length).toBeLessThan(2100);
  });

  it("omite objetos anidados no controlados dentro de los detalles", () => {
    const err = createApplicationError({
      code: ApplicationErrorCode.APP_INVALID_PAYLOAD,
      message: "payload inválido",
      origin: "validation",
      category: "validation",
      retryable: false,
      recoverable: true,
      details: { nested: { a: 1 } },
    });
    const payload = mapErrorToPayload(err);
    expect(payload.details).toBeUndefined();
  });

  it("usa un mensaje seguro cuando el error de dominio no trae mensaje", () => {
    const payload = mapErrorToPayload({ code: "X_CODE" });
    expect(payload.message).toBe("Ha ocurrido un error en un módulo interno.");
  });
});
