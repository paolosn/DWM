// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilesScreen } from "../../../../../src/renderer/screens/profiles/ProfilesScreen.js";
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

describe("ProfilesScreen", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("activar un perfil usa profiles.activate real y no ofrece crear/editar/clonar/eliminar", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
      if (request.operation === "profiles.list")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "profiles.list",
          data: ["default"],
        });
      if (request.operation === "profiles.activate")
        return Promise.resolve({
          success: true,
          requestId: "x",
          operation: "profiles.activate",
          data: { activated: true },
        });
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <ProfilesScreen />
      </ToastProvider>
    );
    await settle();
    expect(
      Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Crear")
    ).toBe(false);
    expect(
      Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Eliminar")
    ).toBe(false);

    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Activar") ??
        null
    );
    await settle();
    const call = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profiles.activate"
    );
    expect((call?.[0] as { payload: { id: string } }).payload).toEqual({ id: "default" });
    expect(container.textContent).toContain("Perfil activado en esta sesión: default");
    unmount();
  });
});

describe("ProfilesScreen — detalle", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("ver detalle carga profiles.get real", async () => {
    const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
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
              enabledTools: ["git"],
              enabledAdapters: [],
              defaultAIProviderId: "claude",
              secretRefs: [],
            },
          },
        });
      }
      return Promise.reject(new Error("no mockeada"));
    });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <ProfilesScreen />
      </ToastProvider>
    );
    await settle();
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver detalle"
      ) ?? null
    );
    await settle();
    expect(container.textContent).toContain("claude");
    expect(container.textContent).toContain("git");
    unmount();
  });

  it("muestra estado vacío cuando no hay perfiles", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "profiles.list", data: [] });
    setDwm(invoke);
    const { container, unmount } = mount(
      <ToastProvider>
        <ProfilesScreen />
      </ToastProvider>
    );
    await settle();
    expect(container.textContent).toContain("Sin perfiles disponibles");
    unmount();
  });
});
