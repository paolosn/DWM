import { describe, it, expect } from "vitest";
import {
  AdapterError,
  createAdapterError,
  AdapterErrorCode,
  AdapterManager,
  AdapterRegistry,
  BaseAdapter,
  AdapterSubject,
} from "../../src/index.js";

describe("AdapterError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createAdapterError({
      code: AdapterErrorCode.ADAPTER_NOT_FOUND,
      message: "m",
      origin: "registry",
      recoverable: true,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AdapterError");
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo AdapterError si ya lo es", () => {
    const original = createAdapterError({
      code: AdapterErrorCode.ADAPTER_INIT_FAILED,
      message: "x",
      origin: "lifecycle",
      recoverable: true,
    });
    const wrapped = AdapterError.wrap(original, {
      code: AdapterErrorCode.ADAPTER_ACTIVATE_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const wrapped = AdapterError.wrap(new Error("nativo"), {
      code: AdapterErrorCode.ADAPTER_INIT_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("nativo");
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = AdapterError.wrap("cadena", {
      code: AdapterErrorCode.ADAPTER_INIT_FAILED,
      origin: "lifecycle",
      recoverable: true,
    });
    expect(wrapped.message).toBe("Error desconocido en el gestor de adaptadores");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createAdapterError({
      code: AdapterErrorCode.ADAPTER_DISPOSE_FAILED,
      message: "m",
      origin: "lifecycle",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({ name: "AdapterError", recoverable: true });
  });
});

describe("Punto de entrada público (@dwm/adapters)", () => {
  it("expone la superficie pública documentada", () => {
    expect(typeof AdapterManager).toBe("function");
    expect(typeof AdapterRegistry).toBe("function");
    expect(typeof BaseAdapter).toBe("function");
    expect(AdapterSubject.VSCODE).toBe("vscode");
    expect(AdapterSubject.ANTHROPIC).toBe("anthropic");
  });
});
