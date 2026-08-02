import { describe, it, expect } from "vitest";
import {
  AIError,
  createAIError,
  AIErrorCode,
  AIManager,
  AIProviderRegistry,
  AIHealthMonitor,
  initialConnection,
  withStatus,
} from "../../src/index.js";

describe("AIError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createAIError({
      code: AIErrorCode.AI_PROVIDER_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AIError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo AIError si ya lo es", () => {
    const original = createAIError({
      code: AIErrorCode.AI_REQUEST_FAILED,
      message: "x",
      origin: "request",
      recoverable: true,
    });
    const wrapped = AIError.wrap(original, {
      code: AIErrorCode.AI_REQUEST_TIMEOUT,
      origin: "request",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = AIError.wrap(new Error("nativo"), {
      code: AIErrorCode.AI_REQUEST_FAILED,
      origin: "request",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = AIError.wrap("cadena", {
      code: AIErrorCode.AI_REQUEST_FAILED,
      origin: "request",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de IA");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createAIError({
      code: AIErrorCode.AI_HEALTH_CHECK_FAILED,
      message: "m",
      origin: "health-check",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "AIError", recoverable: true });
  });
});

describe("AIConnection", () => {
  it("initialConnection() empieza en disconnected sin lastCheckedAt", () => {
    const connection = initialConnection("p1");
    expect(connection).toMatchObject({
      providerId: "p1",
      status: "disconnected",
      lastCheckedAt: null,
    });
  });

  it("withStatus() actualiza el estado y marca lastCheckedAt", () => {
    const connection = initialConnection("p1");
    const updated = withStatus(connection, "connected");
    expect(updated.status).toBe("connected");
    expect(updated.lastCheckedAt).not.toBeNull();
  });

  it("withStatus() incluye lastError cuando se indica", () => {
    const connection = initialConnection("p1");
    const updated = withStatus(connection, "error", "fallo x");
    expect(updated.lastError).toBe("fallo x");
  });
});

describe("Punto de entrada público (@dwm/ai-manager)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof AIManager).toBe("function");
    expect(typeof AIProviderRegistry).toBe("function");
    expect(typeof AIHealthMonitor).toBe("function");
  });
});
