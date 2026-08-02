// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIProvidersScreen } from "../../../../../src/renderer/screens/ai-providers/AIProvidersScreen.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

describe("AIProvidersScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("indica honestamente que no hay administración de proveedores/credenciales", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "profiles.list", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });
    const { container, unmount } = mount(<AIProvidersScreen />);
    await settle();
    expect(container.textContent).toContain("Función no disponible en esta versión");
    unmount();
  });

  it("muestra el proveedor por defecto real de cada perfil, sin llamar a proveedores externos", async () => {
    const invoke = vi
      .fn()
      .mockImplementation((request: { operation: string; payload?: { id?: string } }) => {
        if (request.operation === "profiles.list")
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "profiles.list",
            data: ["default"],
          });
        if (request.operation === "profiles.get") {
          return Promise.resolve({
            success: true,
            requestId: "x",
            operation: "profiles.get",
            data: {
              id: "default",
              configuration: {
                enabledTools: [],
                enabledAdapters: [],
                defaultAIProviderId: "claude",
                secretRefs: [],
              },
            },
          });
        }
        return Promise.reject(new Error("no mockeada"));
      });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: vi.fn() },
      configurable: true,
    });
    const { container, unmount } = mount(<AIProvidersScreen />);
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Cargar proveedores")
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("claude");
    expect(
      invoke.mock.calls.every((c) =>
        ["profiles.list", "profiles.get"].includes((c[0] as { operation: string }).operation)
      )
    ).toBe(true);
    unmount();
  });
});
