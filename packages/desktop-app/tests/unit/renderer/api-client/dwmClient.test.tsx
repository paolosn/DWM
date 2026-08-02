// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { callOperation, DwmOperationError } from "../../../../src/renderer/api-client/index.js";

describe("callOperation", () => {
  const originalDwm = window.dwm;

  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("invoca window.dwm.invoke con un requestId y devuelve data en éxito", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "agents.list",
      data: [{ id: "a1" }],
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    const result = await callOperation("agents.list" as never, { includeArchived: false } as never);

    expect(invoke).toHaveBeenCalledTimes(1);
    const request = invoke.mock.calls[0]?.[0];
    expect(request.operation).toBe("agents.list");
    expect(typeof request.requestId).toBe("string");
    expect(result).toEqual([{ id: "a1" }]);
  });

  it("lanza DwmOperationError cuando la respuesta es success:false", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: false,
      requestId: "x",
      operation: "agents.delete",
      error: {
        code: "NOT_FOUND",
        message: "Agente no encontrado",
        category: "not_found",
        retryable: false,
      },
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    await expect(callOperation("agents.delete" as never, { id: "x" } as never)).rejects.toThrow(
      DwmOperationError
    );
  });

  it("reenvía confirmation cuando se provee", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "agents.delete",
      data: { deleted: true },
    });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });

    await callOperation("agents.delete" as never, { id: "a1" } as never, {
      confirmation: { confirmed: true, token: "a1" },
    });

    const request = invoke.mock.calls[0]?.[0];
    expect(request.confirmation).toEqual({ confirmed: true, token: "a1" });
  });
});
