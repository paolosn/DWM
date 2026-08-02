import { describe, expect, it } from "vitest";
import {
  ApplicationOperation,
  isApplicationOperationTransitionAllowed,
  isTerminalApplicationOperationState,
} from "../../src/ApplicationOperation.js";

describe("ApplicationOperation", () => {
  it("comienza en estado pending con progreso 0", () => {
    const op = new ApplicationOperation({
      operationId: "op-1",
      operation: "backups.create",
      requestId: "req-1",
    });
    const snapshot = op.toSnapshot();
    expect(snapshot.state).toBe("pending");
    expect(snapshot.progress).toBe(0);
    expect(snapshot.cancellable).toBe(true);
  });

  it("progresa de pending a running y reporta progreso", () => {
    const op = new ApplicationOperation({ operationId: "op-2", operation: "x", requestId: "r" });
    op.start();
    op.reportProgress(42);
    const snapshot = op.toSnapshot();
    expect(snapshot.state).toBe("running");
    expect(snapshot.progress).toBe(42);
  });

  it("recorta el progreso reportado al rango 0-100", () => {
    const op = new ApplicationOperation({ operationId: "op-3", operation: "x", requestId: "r" });
    op.start();
    op.reportProgress(500);
    expect(op.toSnapshot().progress).toBe(100);
    op.reportProgress(-10);
    expect(op.toSnapshot().progress).toBe(0);
  });

  it("se completa con un resultado y progreso 100", () => {
    const op = new ApplicationOperation<{ ok: boolean }>({
      operationId: "op-4",
      operation: "x",
      requestId: "r",
    });
    op.start();
    op.complete({ ok: true });
    const snapshot = op.toSnapshot();
    expect(snapshot.state).toBe("completed");
    expect(snapshot.progress).toBe(100);
    expect(snapshot.result).toEqual({ ok: true });
  });

  it("falla con un error normalizado", () => {
    const op = new ApplicationOperation({ operationId: "op-5", operation: "x", requestId: "r" });
    op.start();
    op.fail({ code: "APP_INTERNAL_ERROR", message: "boom" });
    const snapshot = op.toSnapshot();
    expect(snapshot.state).toBe("failed");
    expect(snapshot.error).toEqual({ code: "APP_INTERNAL_ERROR", message: "boom" });
  });

  it("se puede cancelar desde pending o running", () => {
    const op = new ApplicationOperation({ operationId: "op-6", operation: "x", requestId: "r" });
    op.cancel();
    expect(op.toSnapshot().state).toBe("cancelled");
    expect(op.signal.aborted).toBe(true);
  });

  it("invoca el callback onCancel al cancelar", () => {
    let cancelled = false;
    const op = new ApplicationOperation({
      operationId: "op-7",
      operation: "x",
      requestId: "r",
      onCancel: () => {
        cancelled = true;
      },
    });
    op.cancel();
    expect(cancelled).toBe(true);
  });

  it("rechaza cancelar una operación marcada como no cancelable", () => {
    const op = new ApplicationOperation({
      operationId: "op-8",
      operation: "x",
      requestId: "r",
      cancellable: false,
    });
    expect(() => op.cancel()).toThrowError(/no admite cancelación/);
  });

  it("rechaza cancelar una operación ya terminada", () => {
    const op = new ApplicationOperation({ operationId: "op-9", operation: "x", requestId: "r" });
    op.start();
    op.complete(null);
    expect(() => op.cancel()).toThrowError(/ya ha finalizado/);
  });

  it("rechaza transiciones de estado no permitidas", () => {
    const op = new ApplicationOperation({ operationId: "op-10", operation: "x", requestId: "r" });
    // completar sin pasar por "running" no está permitido desde "pending"
    expect(() => op.complete(null)).toThrowError(/Transición de estado no permitida/);
  });

  it("isApplicationOperationTransitionAllowed refleja la máquina de estados", () => {
    expect(isApplicationOperationTransitionAllowed("pending", "running")).toBe(true);
    expect(isApplicationOperationTransitionAllowed("pending", "completed")).toBe(false);
    expect(isApplicationOperationTransitionAllowed("completed", "running")).toBe(false);
  });

  it("isTerminalApplicationOperationState identifica estados terminales", () => {
    expect(isTerminalApplicationOperationState("completed")).toBe(true);
    expect(isTerminalApplicationOperationState("failed")).toBe(true);
    expect(isTerminalApplicationOperationState("cancelled")).toBe(true);
    expect(isTerminalApplicationOperationState("running")).toBe(false);
    expect(isTerminalApplicationOperationState("pending")).toBe(false);
  });
});
