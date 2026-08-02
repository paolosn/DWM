// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../../../src/renderer/shell/AppShell.js";
import { click, flush, mount } from "../support/renderHelpers.js";

const fetchVersionInfo = vi.fn().mockResolvedValue({
  appVersion: "0.1.0",
  apiVersion: "1.0.0",
  minCompatibleApiVersion: "1.0.0",
  platform: "linux",
  electron: "31.0.0",
  chrome: "126.0.0",
  node: "22.0.0",
});

const originalDwm = window.dwm;

describe("AppShell", () => {
  beforeEach(() => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("renderiza sidebar, topbar, contenido y pie de versión", async () => {
    const { container, unmount } = mount(<AppShell fetchVersionInfo={fetchVersionInfo} />);
    expect(container.querySelector('[data-testid="app-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sidebar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="topbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="content-area"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="version-footer"]')).not.toBeNull();
    await flush();
    unmount();
  });

  it("navegar a otra sección actualiza el contenido mostrado", async () => {
    const { container, unmount } = mount(<AppShell fetchVersionInfo={fetchVersionInfo} />);
    await flush();

    const buttons = Array.from(container.querySelectorAll(".dwm-sidebar__list button"));
    const projectsButton = buttons.find((b) => b.textContent === "Proyectos");
    click(projectsButton ?? null);

    expect(container.querySelector('[data-testid="content-area"] h1')?.textContent).toBe(
      "Proyectos"
    );
    unmount();
  });

  it("acepta una sección inicial personalizada", async () => {
    const { container, unmount } = mount(
      <AppShell initialSection="clients" fetchVersionInfo={fetchVersionInfo} />
    );
    await flush();
    expect(container.querySelector('[data-testid="content-area"] h1')?.textContent).toBe(
      "Clientes"
    );
    unmount();
  });
});

describe("AppShell — Command Palette", () => {
  beforeEach(() => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("Ctrl+K abre el Command Palette y seleccionar una acción navega y lo cierra", async () => {
    const { container, unmount } = mount(<AppShell fetchVersionInfo={fetchVersionInfo} />);
    await flush();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })
      );
    });
    await flush();
    expect(container.querySelector('[role="dialog"][aria-label="Buscador global"]')).not.toBeNull();

    const clientsAction = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Ir a Clientes"
    );
    click(clientsAction ?? null);
    await flush();

    expect(container.querySelector('[data-testid="content-area"] h1')?.textContent).toBe(
      "Clientes"
    );
    expect(container.querySelector('[role="dialog"][aria-label="Buscador global"]')).toBeNull();
    unmount();
  });

  it("el botón de búsqueda del Topbar también abre el Command Palette real", async () => {
    const { container, unmount } = mount(<AppShell fetchVersionInfo={fetchVersionInfo} />);
    await flush();
    click(container.querySelector('button[aria-label="Buscar en DWM"]'));
    expect(container.querySelector('[role="dialog"][aria-label="Buscador global"]')).not.toBeNull();
    unmount();
  });
});
