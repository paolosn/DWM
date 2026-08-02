import { describe, it, expect } from "vitest";
import {
  EventBusError,
  createEventBusError,
  EventBusErrorCode,
  EventBus,
  EventEmitter,
  EventBusManager,
  EventPriority,
  PropagationControl,
} from "../../src/index.js";

describe("EventBusError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createEventBusError({
      code: EventBusErrorCode.EVENTBUS_INVALID_PATTERN,
      message: "m",
      origin: "subscription",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("EventBusError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo EventBusError si ya lo es", () => {
    const original = createEventBusError({
      code: EventBusErrorCode.EVENTBUS_HANDLER_FAILED,
      message: "x",
      origin: "dispatch",
      recoverable: true,
    });
    const wrapped = EventBusError.wrap(original, {
      code: EventBusErrorCode.EVENTBUS_MIDDLEWARE_FAILED,
      origin: "middleware",
      recoverable: false,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = EventBusError.wrap(new Error("nativo"), {
      code: EventBusErrorCode.EVENTBUS_MIDDLEWARE_FAILED,
      origin: "middleware",
      recoverable: false,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = EventBusError.wrap("cadena", {
      code: EventBusErrorCode.EVENTBUS_MIDDLEWARE_FAILED,
      origin: "middleware",
      recoverable: false,
    });
    expect(wrapped.message).toBe("Error desconocido en el bus de eventos");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createEventBusError({
      code: EventBusErrorCode.EVENTBUS_INVALID_SUBSCRIPTION,
      message: "m",
      origin: "subscription",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "EventBusError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/event-bus)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof EventBus).toBe("function");
    expect(typeof EventEmitter).toBe("function");
    expect(typeof EventBusManager).toBe("function");
    expect(typeof PropagationControl).toBe("function");
    expect(EventPriority.NORMAL).toBe("normal");
  });
});
