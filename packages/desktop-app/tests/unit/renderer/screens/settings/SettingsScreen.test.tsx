// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "../../../../../src/renderer/screens/settings/SettingsScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
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

describe("SettingsScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("lista namespaces reales de config.list", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "config.list",
      data: ["general", "appearance"],
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("general");
    expect(container.textContent).toContain("appearance");
    unmount();
  });

  it("seleccionar un namespace carga config.get y avisa de cambios sin guardar", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "config.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.list",
          data: ["general"],
        });
      if (request.operation === "config.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.get",
          data: { theme: "light" },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "general") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("light");

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(textarea, '{"theme":"dark"}');
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("Cambios sin guardar");
    unmount();
  });

  it("eliminar un namespace exige confirmación destructiva real", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "config.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.list",
          data: ["general"],
        });
      if (request.operation === "config.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.get",
          data: {},
        });
      if (request.operation === "config.delete")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.delete",
          data: { deleted: true },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "general") ??
        null
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Eliminar namespace"
      ) ?? null
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "config.delete")
    ).toBe(false);
    unmount();
  });
});

describe("SettingsScreen — vacío y cancelar", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra estado vacío cuando no hay namespaces", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "config.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("Sin configuración registrada");
    expect(container.textContent).toContain("Elige un namespace de la izquierda");
    unmount();
  });

  it("cancelar la eliminación de un namespace no invoca config.delete", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "config.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.list",
          data: ["general"],
        });
      if (request.operation === "config.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.get",
          data: {},
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "general") ??
        null
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Eliminar namespace"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some((c) => (c[0] as { operation: string }).operation === "config.delete")
    ).toBe(false);
    unmount();
  });

  it("guardar envía config.set con el JSON editado", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "config.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.list",
          data: ["general"],
        });
      if (request.operation === "config.get")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.get",
          data: { theme: "light" },
        });
      if (request.operation === "config.set")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "config.set",
          data: { updated: true },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <SettingsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "general") ??
        null
    );
    await settle();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    act(() => {
      setter?.call(textarea, '{"theme":"dark"}');
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Guardar") ??
        null
    );
    await settle();
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "config.set"
    );
    expect((call?.[0] as { payload: { namespace: string; value: unknown } }).payload).toEqual({
      namespace: "general",
      value: { theme: "dark" },
    });
    unmount();
  });
});
