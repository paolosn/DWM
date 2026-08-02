// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PluginsScreen } from "../../../../../src/renderer/screens/plugins/PluginsScreen.js";
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

describe("PluginsScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("desactivar exige confirmación destructiva antes de llamar a plugins.deactivate", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "plugins.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.list",
          data: ["p1"],
        });
      if (request.operation === "plugins.deactivate")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.deactivate",
          data: { deactivated: true },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <PluginsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Desactivar"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "plugins.deactivate"
      )
    ).toBe(false);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const confirmButton = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (b) => b.textContent === "Desactivar"
    );
    click(confirmButton ?? null);
    await settle();
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "plugins.deactivate"
      )
    ).toBe(true);
    unmount();
  });

  it("comprobar salud usa plugins.check-health real", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "plugins.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.list",
          data: ["p1"],
        });
      if (request.operation === "plugins.check-health")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.check-health",
          data: { pluginId: "p1", status: "healthy", checkedAt: "x" },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <PluginsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Comprobar salud"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("healthy");
    unmount();
  });
});

describe("PluginsScreen — detalle, vacío y cancelar", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra estado vacío cuando no hay plugins", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "plugins.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <PluginsScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("Sin plugins registrados");
    unmount();
  });

  it("ver detalle carga plugins.get real", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "plugins.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.list",
          data: ["p1"],
        });
      if (request.operation === "plugins.get") {
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "plugins.get",
          data: {
            manifest: {
              id: "p1",
              name: "Mi Plugin",
              version: "1.0.0",
              description: "desc",
              author: "yo",
              entryPoint: "x",
              minDwmVersion: "1.0.0",
            },
            metadata: { id: "p1", installedAt: "x", updatedAt: "x" },
            configuration: {},
            grantedPermissions: [],
            state: "active",
          },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <PluginsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Detalle") ??
        null
    );
    await settle();
    expect(container.textContent).toContain("Mi Plugin");
    unmount();
  });

  it("cancelar la desactivación no invoca plugins.deactivate", async () => {
    const invoke = vi.fn().mockResolvedValue({
      success: true,
      requestId: "x",
      operation: "plugins.list",
      data: ["p1"],
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <PluginsScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Desactivar"
      ) ?? null
    );
    click(
      Array.from(container.querySelectorAll('[role="dialog"] button')).find(
        (b) => b.textContent === "Cancelar"
      ) ?? null
    );
    expect(
      invoke.mock.calls.some(
        (c) => (c[0] as { operation: string }).operation === "plugins.deactivate"
      )
    ).toBe(false);
    unmount();
  });
});
