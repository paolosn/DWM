import { describe, expect, it } from "vitest";
import { ApplicationOperationRegistry } from "../../src/ApplicationOperationRegistry.js";

describe("ApplicationOperationRegistry", () => {
  it("registra y recupera definiciones de operación (catálogo)", () => {
    const registry = new ApplicationOperationRegistry();
    registry.register({
      name: "demo.op",
      version: "1.0.0",
      capabilities: ["read"],
      handler: () => "ok",
    });

    expect(registry.has("demo.op")).toBe(true);
    expect(registry.has("demo.unknown")).toBe(false);
    expect(registry.get("demo.op")?.version).toBe("1.0.0");
    expect(registry.list()).toHaveLength(1);
  });

  it("realiza seguimiento de una operación larga: pending -> running -> completed", () => {
    const registry = new ApplicationOperationRegistry();
    const record = registry.beginTracking("packages.create", "req-1");
    expect(record.getState()).toBe("pending");

    record.start();
    record.reportProgress(50);
    const midSnapshot = registry.getSnapshot(record.operationId);
    expect(midSnapshot?.state).toBe("running");
    expect(midSnapshot?.progress).toBe(50);

    record.complete({ done: true });
    const finalSnapshot = registry.requireSnapshot(record.operationId);
    expect(finalSnapshot.state).toBe("completed");
  });

  it("requireSnapshot lanza APP_OPERATION_NOT_FOUND para un id inexistente", () => {
    const registry = new ApplicationOperationRegistry();
    expect(() => registry.requireSnapshot("no-existe")).toThrowError(
      /No existe ninguna operación en curso/
    );
  });

  it("lista todas las operaciones en curso", () => {
    const registry = new ApplicationOperationRegistry();
    registry.beginTracking("a.op", "req-a");
    registry.beginTracking("b.op", "req-b");
    expect(registry.listSnapshots()).toHaveLength(2);
  });

  it("cancela una operación en curso", () => {
    const registry = new ApplicationOperationRegistry();
    const record = registry.beginTracking("a.op", "req-a");
    registry.cancel(record.operationId);
    expect(registry.getSnapshot(record.operationId)?.state).toBe("cancelled");
  });

  it("cancel lanza APP_OPERATION_NOT_FOUND para un id inexistente", () => {
    const registry = new ApplicationOperationRegistry();
    expect(() => registry.cancel("no-existe")).toThrowError(/No existe ninguna operación/);
  });

  it("cleanupFinished elimina únicamente las operaciones en estado terminal", () => {
    const registry = new ApplicationOperationRegistry();
    const finished = registry.beginTracking("a.op", "req-a");
    finished.start();
    finished.complete(null);
    const stillRunning = registry.beginTracking("b.op", "req-b");
    stillRunning.start();

    const removed = registry.cleanupFinished();
    expect(removed).toBe(1);
    expect(registry.getSnapshot(finished.operationId)).toBeUndefined();
    expect(registry.getSnapshot(stillRunning.operationId)).toBeDefined();
  });
});
