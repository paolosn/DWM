// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspacesScreen } from "../../../../../src/renderer/screens/workspaces/WorkspacesScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;
function setDwm(invoke: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
}
async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}
function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("WorkspacesScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra el workspace activo real vía workspace.get", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "workspace.get",
      data: {
        root: "/x/ws",
        metadata: { id: "ws1", formatVersion: "1.0.0" },
        registeredAt: "2026-01-01T00:00:00.000Z",
      },
    });
    setDwm(invoke);
    const { container, unmount } = mount(<WorkspacesScreen />);
    await settle();
    expect(container.textContent).toContain("/x/ws");
    expect(container.textContent).toContain("ws1");
    unmount();
  });

  it("valida una ruta con workspace.validate real y muestra los problemas reales", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "workspace.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "workspace.get",
          data: undefined,
        });
      if (request.operation === "workspace.validate") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "workspace.validate",
          data: {
            valid: false,
            issues: [{ code: "MISSING", message: "Falta .dwm/workspace.json" }],
          },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(<WorkspacesScreen />);
    await settle();
    const input = container.querySelectorAll("input")[1];
    setValue(input as HTMLInputElement, "/x/otra-ruta");
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Validar") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("Con problemas");
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "workspace.validate"
    );
    expect((call?.[0] as { payload: { root: string } }).payload).toEqual({ root: "/x/otra-ruta" });
    unmount();
  });
});

describe("WorkspacesScreen — inicializar y activar", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("inicializar y activar llama a workspace.initialize y workspace.register reales, en ese orden", async () => {
    const calls: string[] = [];
    const invoke = vi
      .fn()
      .mockImplementation((request: { operation: string; payload?: { root?: string } }) => {
        calls.push(request.operation);
        if (request.operation === "workspace.get") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "workspace.get",
            data: undefined,
          });
        }
        if (request.operation === "workspace.initialize") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "workspace.initialize",
            data: {
              paths: {},
              metadata: { id: "ws1" },
              alreadyInitialized: false,
              createdDirectories: [],
            },
          });
        }
        if (request.operation === "workspace.register") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "workspace.register",
            data: { root: request.payload?.root, metadata: {}, registeredAt: "x" },
          });
        }
        return Promise.reject(new Error("no mockeada"));
      });
    setDwm(invoke);
    const { container, unmount } = mount(<WorkspacesScreen />);
    await settle();

    const input = container.querySelectorAll("input")[0] as HTMLInputElement;
    setValue(input, "/x/nuevo-ws");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Inicializar y activar"
      ) ?? null
    );
    await settle();

    expect(calls).toContain("workspace.initialize");
    expect(calls).toContain("workspace.register");
    expect(calls.indexOf("workspace.initialize")).toBeLessThan(calls.indexOf("workspace.register"));
    const initCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "workspace.initialize"
    );
    expect((initCall?.[0] as { payload: { root: string } }).payload).toEqual({
      root: "/x/nuevo-ws",
    });
    expect(container.textContent).toContain("Workspace activado");
    unmount();
  });

  it("muestra el error real si la activación falla", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "workspace.get") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "workspace.get",
          data: undefined,
        });
      }
      if (request.operation === "workspace.initialize") {
        return Promise.resolve({
          success: false,
          requestId: "x",
          operation: "workspace.initialize",
          error: { code: "E", message: "ruta no escribible", category: "unknown", retryable: true },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(<WorkspacesScreen />);
    await settle();
    const input = container.querySelectorAll("input")[0] as HTMLInputElement;
    setValue(input, "/x/sin-permiso");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Inicializar y activar"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("No se pudo activar el Workspace");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle técnico"
      ) ?? null
    );
    expect(container.textContent).toContain("ruta no escribible");
    unmount();
  });
});
