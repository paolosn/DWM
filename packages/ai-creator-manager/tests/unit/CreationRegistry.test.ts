import { describe, expect, it } from "vitest";
import { CreationRegistry } from "../../src/CreationRegistry.js";
import { CreationError } from "../../src/errors/CreationError.js";

describe("CreationRegistry", () => {
  it("registra una operación en estado pending", () => {
    const registry = new CreationRegistry();
    const record = registry.register("op-1", "agent");
    expect(record.state).toBe("pending");
    expect(record.kind).toBe("agent");
  });

  it("get/require devuelven la operación registrada", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "skill");
    expect(registry.get("op-1")?.kind).toBe("skill");
    expect(registry.require("op-1").kind).toBe("skill");
  });

  it("require lanza CreationError si la operación no existe", () => {
    const registry = new CreationRegistry();
    expect(() => registry.require("nope")).toThrow(CreationError);
  });

  it("transition avanza el estado y actualiza updatedAt", async () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "rule");
    const before = registry.require("op-1").updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = registry.transition("op-1", "validating");
    expect(updated.state).toBe("validating");
    expect(updated.updatedAt >= before).toBe(true);
  });

  it("transition no sale de un estado terminal", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "rule");
    registry.transition("op-1", "completed");
    const attempt = registry.transition("op-1", "executing");
    expect(attempt.state).toBe("completed");
  });

  it("transition guarda el mensaje de error cuando se indica", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "rule");
    const failed = registry.transition("op-1", "failed", "boom");
    expect(failed.state).toBe("failed");
    expect(failed.error).toBe("boom");
  });

  it("cancel marca la operación como cancelada y devuelve true", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "knowledge");
    expect(registry.cancel("op-1")).toBe(true);
    expect(registry.get("op-1")?.state).toBe("cancelled");
    expect(registry.isCancelled("op-1")).toBe(true);
  });

  it("cancel devuelve false si la operación ya es terminal", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "knowledge");
    registry.transition("op-1", "completed");
    expect(registry.cancel("op-1")).toBe(false);
  });

  it("isCancelled/isTerminal devuelven false para operaciones desconocidas o en curso", () => {
    const registry = new CreationRegistry();
    expect(registry.isCancelled("nope")).toBe(false);
    expect(registry.isTerminal("nope")).toBe(false);
    registry.register("op-1", "client");
    expect(registry.isTerminal("op-1")).toBe(false);
  });

  it("list devuelve las operaciones ordenadas por fecha de creación", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "agent");
    registry.register("op-2", "skill");
    const list = registry.list();
    expect(list.map((r) => r.operationId)).toEqual(["op-1", "op-2"]);
  });

  it("clear vacía el registro", () => {
    const registry = new CreationRegistry();
    registry.register("op-1", "agent");
    registry.clear();
    expect(registry.list()).toEqual([]);
  });
});
