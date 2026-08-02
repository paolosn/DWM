import { describe, it, expect } from "vitest";
import { AIProviderRegistry } from "../../src/AIProviderRegistry.js";
import { AIErrorCode } from "../../src/errors/AIErrorCode.js";
import { makeFakeProvider } from "./support/fakeProvider.js";

describe("AIProviderRegistry", () => {
  it("registra un proveedor y lo deja activo por ser el primero", () => {
    const registry = new AIProviderRegistry();
    const provider = makeFakeProvider({ id: "p1" });
    registry.register(provider);
    expect(registry.getActiveId()).toBe("p1");
    expect(registry.list()).toEqual(["p1"]);
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1" }));
    expect(() => registry.register(makeFakeProvider({ id: "p1" }))).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_PROVIDER_ALREADY_REGISTERED })
    );
  });

  it("require() lanza AI_PROVIDER_NOT_FOUND si no existe", () => {
    const registry = new AIProviderRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_PROVIDER_NOT_FOUND })
    );
  });

  it("setActive() cambia el proveedor activo; requireActive() lanza si no hay ninguno", () => {
    const registry = new AIProviderRegistry();
    expect(() => registry.requireActive()).toThrow(
      expect.objectContaining({ code: AIErrorCode.AI_NO_ACTIVE_PROVIDER })
    );

    registry.register(makeFakeProvider({ id: "p1" }));
    registry.register(makeFakeProvider({ id: "p2" }));
    registry.setActive("p2");
    expect(registry.getActiveId()).toBe("p2");
    expect(registry.requireActive().provider.id).toBe("p2");
  });

  it("register(..., setActive=true) fuerza el proveedor activo", () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1" }));
    registry.register(makeFakeProvider({ id: "p2" }), undefined, true);
    expect(registry.getActiveId()).toBe("p2");
  });

  it("unregister() reasigna el activo a otro proveedor restante, o a null si no queda ninguno", () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1" }));
    registry.register(makeFakeProvider({ id: "p2" }));
    registry.unregister("p1");
    expect(registry.getActiveId()).toBe("p2");
    registry.unregister("p2");
    expect(registry.getActiveId()).toBeNull();
  });

  it("mantiene y actualiza el estado de conexión por proveedor", () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1" }));
    expect(registry.getConnection("p1")?.status).toBe("disconnected");
    registry.updateConnectionStatus("p1", "connected");
    expect(registry.getConnection("p1")?.status).toBe("connected");
    registry.updateConnectionStatus("no-existe", "connected"); // no-op, no lanza
  });

  it("clear() vacía el registro y el activo", () => {
    const registry = new AIProviderRegistry();
    registry.register(makeFakeProvider({ id: "p1" }));
    registry.clear();
    expect(registry.list()).toEqual([]);
    expect(registry.getActiveId()).toBeNull();
  });
});
