// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceScreen } from "../../../../../src/renderer/screens/workspace/WorkspaceScreen.js";
import { ToastProvider } from "../../../../../src/renderer/design-system/composites/Toast/index.js";
import { __resetQueryCacheForTests } from "../../../../../src/renderer/api-client/queryCache.js";
import { click, mount } from "../../../support/renderHelpers.js";

const originalDwm = window.dwm;

const DEFAULT_RESPONSES: Record<string, unknown> = {
  "workspace.get": { success: true, requestId: "x", operation: "workspace.get", data: undefined },
  "profiles.list": { success: true, requestId: "x", operation: "profiles.list", data: [] },
  "environment.list-tools": {
    success: true,
    requestId: "x",
    operation: "environment.list-tools",
    data: [],
  },
  "system.status": {
    success: true,
    requestId: "x",
    operation: "system.status",
    data: { snapshotId: "s1", level: "OK", generatedAt: "2026-01-01T00:00:00.000Z", reports: [] },
  },
};

function setDwm(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const invoke = vi.fn().mockImplementation((request: { operation: string }) => {
    if (request.operation in overrides) return Promise.resolve(overrides[request.operation]);
    if (request.operation in DEFAULT_RESPONSES)
      return Promise.resolve(DEFAULT_RESPONSES[request.operation]);
    return Promise.resolve({
      success: true,
      requestId: "x",
      operation: request.operation,
      data: [],
    });
  });
  Object.defineProperty(window, "dwm", {
    value: { invoke, getVersionInfo: vi.fn() },
    configurable: true,
  });
  return invoke;
}

async function settle(times = 3): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) {
      await Promise.resolve();
    }
  });
}

function mountScreen() {
  return mount(
    <ToastProvider>
      <WorkspaceScreen />
    </ToastProvider>
  );
}

describe("WorkspaceScreen", () => {
  afterEach(() => {
    __resetQueryCacheForTests();
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("muestra los datos reales del workspace activo", async () => {
    setDwm({
      "workspace.get": {
        success: true,
        requestId: "x",
        operation: "workspace.get",
        data: {
          root: "/Users/paolo/dwm-workspace",
          metadata: { id: "ws-1" },
          registeredAt: "2026-01-01T00:00:00.000Z",
        },
      },
    });
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("/Users/paolo/dwm-workspace");
    expect(container.textContent).toContain("ws-1");
    unmount();
  });

  it("muestra estado vacío cuando no hay workspace registrado", async () => {
    setDwm({
      "workspace.get": {
        success: true,
        requestId: "x",
        operation: "workspace.get",
        data: undefined,
      },
    });
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Sin Workspace registrado");
    unmount();
  });

  it("activa un perfil real con profiles.activate y lo refleja en la sesión", async () => {
    const invoke = setDwm({
      "profiles.list": {
        success: true,
        requestId: "x",
        operation: "profiles.list",
        data: ["default", "cliente-a"],
      },
      "profiles.activate": {
        success: true,
        requestId: "x",
        operation: "profiles.activate",
        data: { activated: true },
      },
    });
    const { container, unmount } = mountScreen();
    await settle();

    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "cliente-a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Activar perfil"
      ) ?? null
    );
    await settle();

    const activateCall = invoke.mock.calls.find(
      (c) => (c[0] as { operation: string }).operation === "profiles.activate"
    );
    expect((activateCall?.[0] as { payload: { id: string } }).payload).toEqual({ id: "cliente-a" });
    expect(container.textContent).toContain("Perfil activado en esta sesión");
    expect(container.textContent).toContain("cliente-a");
    unmount();
  });

  it("muestra las herramientas detectadas con su estado", async () => {
    setDwm({
      "environment.list-tools": {
        success: true,
        requestId: "x",
        operation: "environment.list-tools",
        data: [{ id: "git", name: "Git", category: "vcs", status: "available" }],
      },
    });
    const { container, unmount } = mountScreen();
    await settle();
    expect(container.textContent).toContain("Git");
    expect(container.textContent).toContain("available");
    unmount();
  });

  it("las acciones sin operación pública muestran 'Función no disponible en esta versión'", async () => {
    setDwm();
    const { container, unmount } = mountScreen();
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Abrir editor"
      ) ?? null
    );
    expect(container.textContent).toContain("Función no disponible en esta versión");
    unmount();
  });
});
