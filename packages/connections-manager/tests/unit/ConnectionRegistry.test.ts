import { describe, it, expect } from "vitest";
import { ConnectionRegistry } from "../../src/ConnectionRegistry.js";
import type { Connection } from "../../src/ConnectionTypes.js";

function makeConnection(id: string): Connection {
  return {
    id,
    projectId: "proj-1",
    name: `Conexión ${id}`,
    type: "http",
    profileIds: [],
    status: "unconfigured",
    enabled: true,
    capabilities: [],
    secretReferences: {},
    config: {},
    adapterId: "http",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTestAt: null,
    lastSuccessfulTestAt: null,
    lastError: null,
    metadata: { dwm: {} },
  };
}

describe("ConnectionRegistry", () => {
  it("get() devuelve undefined si el proyecto nunca se cacheó", () => {
    const registry = new ConnectionRegistry();
    expect(registry.get("/no/existe")).toBeUndefined();
  });

  it("set()/get() devuelven copias independientes (no la misma referencia)", () => {
    const registry = new ConnectionRegistry();
    const original = [makeConnection("a")];
    registry.set("/proj", original);
    const read = registry.get("/proj")!;
    expect(read).toEqual(original);
    expect(read).not.toBe(original);
  });

  it("invalidate() elimina solo el proyecto indicado", () => {
    const registry = new ConnectionRegistry();
    registry.set("/proj-a", [makeConnection("a")]);
    registry.set("/proj-b", [makeConnection("b")]);
    registry.invalidate("/proj-a");
    expect(registry.get("/proj-a")).toBeUndefined();
    expect(registry.get("/proj-b")).toBeDefined();
  });

  it("clear() elimina todo el índice en memoria", () => {
    const registry = new ConnectionRegistry();
    registry.set("/proj-a", [makeConnection("a")]);
    registry.clear();
    expect(registry.get("/proj-a")).toBeUndefined();
  });
});
