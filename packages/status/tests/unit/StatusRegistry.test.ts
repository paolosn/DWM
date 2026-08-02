import { describe, it, expect } from "vitest";
import { StatusRegistry } from "../../src/StatusRegistry.js";
import { StatusErrorCode } from "../../src/errors/StatusErrorCode.js";
import { makeStatusReport } from "../../src/StatusTypes.js";

function makeProvider(id: string) {
  return { id, getStatus: () => makeStatusReport(id, "OK", "ok") };
}

describe("StatusRegistry — registro básico", () => {
  it("registra y consulta; list() ordena alfabéticamente", () => {
    const registry = new StatusRegistry();
    registry.register(makeProvider("b"));
    registry.register(makeProvider("a"));
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("rechaza un proveedor sin id o sin getStatus()", () => {
    const registry = new StatusRegistry();
    expect(() =>
      registry.register({ id: "", getStatus: () => makeStatusReport("x", "OK", "ok") })
    ).toThrow(expect.objectContaining({ code: StatusErrorCode.STATUS_INVALID_PROVIDER }));
    expect(() => registry.register({ id: "x" } as never)).toThrow(
      expect.objectContaining({ code: StatusErrorCode.STATUS_INVALID_PROVIDER })
    );
    expect(() => registry.register(null as never)).toThrow(
      expect.objectContaining({ code: StatusErrorCode.STATUS_INVALID_PROVIDER })
    );
  });

  it("rechaza registrar un id duplicado", () => {
    const registry = new StatusRegistry();
    registry.register(makeProvider("p1"));
    expect(() => registry.register(makeProvider("p1"))).toThrow(
      expect.objectContaining({ code: StatusErrorCode.STATUS_PROVIDER_ALREADY_REGISTERED })
    );
  });

  it("require() lanza STATUS_PROVIDER_NOT_FOUND si no existe", () => {
    const registry = new StatusRegistry();
    expect(() => registry.require("no-existe")).toThrow(
      expect.objectContaining({ code: StatusErrorCode.STATUS_PROVIDER_NOT_FOUND })
    );
  });

  it("has()/get() reflejan el registro", () => {
    const registry = new StatusRegistry();
    registry.register(makeProvider("p1"));
    expect(registry.has("p1")).toBe(true);
    expect(registry.has("no-existe")).toBe(false);
    expect(registry.get("p1")?.id).toBe("p1");
    expect(registry.get("no-existe")).toBeUndefined();
  });

  it("unregister()/clear() eliminan del registro", () => {
    const registry = new StatusRegistry();
    registry.register(makeProvider("p1"));
    registry.unregister("p1");
    expect(registry.list()).toEqual([]);
    registry.register(makeProvider("p2"));
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
