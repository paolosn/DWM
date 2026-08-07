// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationProvider } from "../../../src/renderer/shell/NavigationContext.js";
import { ContentArea } from "../../../src/renderer/shell/ContentArea.js";
import { ToastProvider } from "../../../src/renderer/design-system/composites/Toast/index.js";
import { click, mount } from "../support/renderHelpers.js";

async function settle(times = 8): Promise<void> {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve();
  });
}

const originalDwm = window.dwm;

function setDwm(): void {
  const invoke = vi
    .fn()
    .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
  const getVersionInfo = vi.fn().mockResolvedValue({
    appVersion: "0.1.0",
    apiVersion: "1.0.0",
    minCompatibleApiVersion: "1.0.0",
    platform: "linux",
    electron: "31.0.0",
    chrome: "126.0.0",
    node: "22.0.0",
  });
  Object.defineProperty(window, "dwm", { value: { invoke, getVersionInfo }, configurable: true });
}

describe("ContentArea", () => {
  afterEach(() => {
    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
  });

  it("renderiza la pantalla real de Configuración (Módulo 33B)", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="settings">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Configuración");
    expect(container.textContent).not.toContain("se implementa más adelante");
    unmount();
  });

  it("renderiza la pantalla real de Acerca de DWM (Módulo 33B)", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="about">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Acerca de DWM");
    unmount();
  });

  it("renderiza la pantalla real de Proyectos", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="projects">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Proyectos");
    expect(container.textContent).not.toContain("se implementa más adelante");
    unmount();
  });

  it("renderiza la pantalla real de Inicio (Dashboard) por defecto", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider>
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Bienvenido a DWM");
    expect(container.textContent).not.toContain("se implementa más adelante");
    unmount();
  });

  it("renderiza la pantalla real de Centro de trabajo", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="workspace">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Centro de trabajo");
    unmount();
  });

  it("renderiza la pantalla real para una sección ya implementada (Clientes)", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="clients">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Clientes");
    expect(container.textContent).not.toContain("se implementa más adelante");
    unmount();
  });

  it("la ruta antigua 'aiCreator' redirige de verdad a Biblioteca IA, nunca muestra la pantalla técnica de JSON en bruto", () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="aiCreator">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    expect(container.querySelector("h1")?.textContent).toBe("Biblioteca IA");
    expect(container.textContent).not.toContain("AI Creator");
    unmount();
  });

  it("'Clientes' desde Inicio navega a la pantalla real de Clientes", async () => {
    setDwm();
    const { container, unmount } = mount(
      <NavigationProvider initialSection="dashboard">
        <ToastProvider>
          <ContentArea />
        </ToastProvider>
      </NavigationProvider>
    );
    await settle();

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ver clientes"
      ) ?? null
    );
    await settle();

    expect(container.querySelector("h1")?.textContent).toBe("Clientes");
    unmount();
  });
});
