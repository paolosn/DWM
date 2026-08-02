import { describe, it, expect } from "vitest";
import { HostError, createHostError } from "../../src/errors/HostError.js";
import { HostErrorCode } from "../../src/errors/HostErrorCatalog.js";
import { HostLifecycleState, isHostTransitionAllowed } from "../../src/host/HostLifecycleState.js";
import { CleanupStack } from "../../src/composition/CleanupStack.js";
import { DependencyContainer } from "../../src/composition/DependencyContainer.js";

describe("HostError", () => {
  it("construye un error con todos los campos esperados", () => {
    const err = createHostError({
      code: HostErrorCode.HOST_INVALID_CONFIGURATION,
      message: "mensaje",
      origin: "configuration",
      recoverable: false,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("HostError");
    expect(err.code).toBe(HostErrorCode.HOST_INVALID_CONFIGURATION);
    expect(err.recoverable).toBe(false);
    expect(typeof err.timestamp).toBe("string");
  });

  it("wrap() devuelve el mismo HostError si ya lo es", () => {
    const original = createHostError({
      code: HostErrorCode.HOST_INVALID_MANIFEST,
      message: "x",
      origin: "manifest",
      recoverable: true,
    });
    const wrapped = HostError.wrap(original, {
      code: HostErrorCode.HOST_USE_CASE_FAILED,
      origin: "use-case",
      recoverable: true,
    });
    expect(wrapped).toBe(original);
  });

  it("wrap() envuelve un Error nativo preservando su mensaje", () => {
    const native = new Error("fallo nativo");
    const wrapped = HostError.wrap(native, {
      code: HostErrorCode.HOST_DEPENDENCY_MISSING,
      origin: "composition",
      recoverable: false,
    });
    expect(wrapped.message).toBe("fallo nativo");
    expect(wrapped.cause).toBe(native);
  });

  it("wrap() usa un mensaje por defecto si la causa no es un Error", () => {
    const wrapped = HostError.wrap("cadena", {
      code: HostErrorCode.HOST_DEPENDENCY_MISSING,
      origin: "composition",
      recoverable: false,
    });
    expect(wrapped.message).toBe("Error desconocido en la capa host");
  });

  it("toJSON() produce una representación serializable", () => {
    const err = createHostError({
      code: HostErrorCode.HOST_SHUTDOWN_PARTIAL_FAILURE,
      message: "m",
      origin: "shutdown",
      recoverable: true,
    });
    expect(err.toJSON()).toMatchObject({
      name: "HostError",
      code: HostErrorCode.HOST_SHUTDOWN_PARTIAL_FAILURE,
      recoverable: true,
    });
  });
});

describe("HostLifecycleState", () => {
  it("permite las transiciones documentadas en TDS-001 §7.2", () => {
    expect(
      isHostTransitionAllowed(HostLifecycleState.CREATED, HostLifecycleState.VALIDATING_COMPOSITION)
    ).toBe(true);
    expect(isHostTransitionAllowed(HostLifecycleState.READY, HostLifecycleState.RUNNING)).toBe(
      true
    );
    expect(
      isHostTransitionAllowed(HostLifecycleState.RUNNING, HostLifecycleState.SHUTTING_DOWN)
    ).toBe(true);
    expect(
      isHostTransitionAllowed(HostLifecycleState.SHUTTING_DOWN, HostLifecycleState.STOPPED)
    ).toBe(true);
  });

  it("rechaza transiciones no documentadas", () => {
    expect(isHostTransitionAllowed(HostLifecycleState.CREATED, HostLifecycleState.RUNNING)).toBe(
      false
    );
    expect(isHostTransitionAllowed(HostLifecycleState.STOPPED, HostLifecycleState.CREATED)).toBe(
      false
    );
    expect(isHostTransitionAllowed(HostLifecycleState.ERROR, HostLifecycleState.READY)).toBe(false);
  });
});

describe("CleanupStack", () => {
  it("libera en orden inverso de creación", async () => {
    const order: string[] = [];
    const stack = new CleanupStack();
    stack.push({ kind: "external-dependency", id: "a", dispose: async () => void order.push("a") });
    stack.push({ kind: "external-dependency", id: "b", dispose: async () => void order.push("b") });

    await stack.unwind();

    expect(order).toEqual(["b", "a"]);
  });

  it("agrega los fallos sin detenerse por uno aislado", async () => {
    const stack = new CleanupStack();
    stack.push({
      kind: "external-dependency",
      id: "falla-1",
      dispose: async () => {
        throw new Error("fallo 1");
      },
    });
    stack.push({
      kind: "external-dependency",
      id: "falla-2",
      dispose: async () => {
        throw new Error("fallo 2");
      },
    });

    const result = await stack.unwind();

    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((f) => f.id).sort()).toEqual(["falla-1", "falla-2"]);
  });

  it("discard() retira una entrada sin invocar su dispose", async () => {
    let disposed = false;
    const stack = new CleanupStack();
    stack.push({
      kind: "component",
      id: "x",
      dispose: async () => {
        disposed = true;
      },
    });
    stack.discard("component", "x");

    await stack.unwind();

    expect(disposed).toBe(false);
    expect(stack.isEmpty()).toBe(true);
  });

  it("isEmpty() refleja el estado de la pila", () => {
    const stack = new CleanupStack();
    expect(stack.isEmpty()).toBe(true);
    stack.push({ kind: "external-dependency", id: "a", dispose: async () => {} });
    expect(stack.isEmpty()).toBe(false);
  });
});

describe("DependencyContainer", () => {
  it("almacena y resuelve valores por nombre", () => {
    const container = new DependencyContainer();
    container.set("clock", { value: { now: () => new Date(0) } });
    expect(container.has("clock")).toBe(true);
    expect(container.has("otra")).toBe(false);
    expect(container.names()).toEqual(["clock"]);

    const resolved = container.resolveFor(["clock", "inexistente"]);
    expect(resolved.clock).toBeDefined();
    expect(resolved.inexistente).toBeUndefined();
  });

  it("conserva el disposer asociado a una dependencia", () => {
    const container = new DependencyContainer();
    const dispose = async () => {};
    container.set("red", { value: {}, dispose });
    expect(container.getDisposer("red")).toBe(dispose);
    expect(container.getDisposer("clock")).toBeUndefined();
  });
});
