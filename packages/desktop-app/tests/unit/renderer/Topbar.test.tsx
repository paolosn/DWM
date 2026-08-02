// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Topbar } from "../../../src/renderer/shell/Topbar.js";
import { click, mount } from "../support/renderHelpers.js";

const fetchVersionInfo = vi.fn().mockResolvedValue({
  appVersion: "0.1.0",
  apiVersion: "1.0.0",
  minCompatibleApiVersion: "1.0.0",
  platform: "linux",
  electron: "31.0.0",
  chrome: "126.0.0",
  node: "22.0.0",
});

describe("Topbar", () => {
  it("muestra el selector de proyecto vacío por defecto", () => {
    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    expect((container.querySelector("input") as HTMLInputElement).placeholder).toBe(
      "Sin proyecto activo"
    );
    unmount();
  });

  it("indica el estado de salud del motor tras comprobarlo", async () => {
    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Operativo");
    unmount();
  });

  it("muestra un estado de salud de error cuando la comprobación falla", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("sin conexión"));
    const { container, unmount } = mount(<Topbar fetchVersionInfo={failingFetch} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Sin conexión con el motor");
    unmount();
  });

  it("el buscador global muestra 'Función no disponible en esta versión'", () => {
    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Buscar en DWM"]'));
    expect(container.textContent).toContain("Función no disponible en esta versión");
    unmount();
  });

  it("notificaciones abre el Centro de notificaciones real", async () => {
    const originalDwm = window.dwm;
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });

    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Notificaciones"]'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Sin notificaciones");

    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    unmount();
  });

  it("operaciones abre el Centro de operaciones real", async () => {
    const originalDwm = window.dwm;
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });

    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Operaciones en curso"]'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Centro de operaciones");
    expect(container.textContent).toContain("Sin backups recientes");

    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    unmount();
  });
});

describe("Topbar — selector de proyecto y onOpenSearch", () => {
  it("con projectOptions, seleccionar un proyecto llama a onActiveProjectChange", () => {
    const onActiveProjectChange = vi.fn();
    const { container, unmount } = mount(
      <Topbar
        fetchVersionInfo={fetchVersionInfo}
        projectOptions={[{ id: "p1", name: "DWM" }]}
        onActiveProjectChange={onActiveProjectChange}
      />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(input, "DWM");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
      );
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(onActiveProjectChange).toHaveBeenCalledWith("p1");
    unmount();
  });

  it("cuando se provee onOpenSearch, el botón de búsqueda lo invoca en vez del modal interno", () => {
    const onOpenSearch = vi.fn();
    const { container, unmount } = mount(
      <Topbar fetchVersionInfo={fetchVersionInfo} onOpenSearch={onOpenSearch} />
    );
    click(container.querySelector('button[aria-label="Buscar en DWM"]'));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Función no disponible en esta versión");
    unmount();
  });

  it("usa la etiqueta de perfil activo personalizada", () => {
    const { container, unmount } = mount(
      <Topbar fetchVersionInfo={fetchVersionInfo} activeProfileLabel="Perfil: cliente-a" />
    );
    expect(container.textContent).toContain("Perfil: cliente-a");
    unmount();
  });
});

describe("Topbar — cierre de overlays", () => {
  it("cierra el modal de búsqueda con el botón Cerrar", () => {
    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Buscar en DWM"]'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    click(container.querySelector('button[aria-label="Cerrar"]'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    unmount();
  });

  it("cierra el drawer de notificaciones con el botón Cerrar", async () => {
    const originalDwm = window.dwm;
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });

    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Notificaciones"]'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    click(container.querySelector('button[aria-label="Cerrar"]'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    unmount();
  });

  it("cierra el drawer de operaciones con el botón Cerrar", async () => {
    const originalDwm = window.dwm;
    const invoke = vi
      .fn()
      .mockResolvedValue({ success: true, requestId: "x", operation: "x", data: [] });
    Object.defineProperty(window, "dwm", {
      value: { invoke, getVersionInfo: fetchVersionInfo },
      configurable: true,
    });

    const { container, unmount } = mount(<Topbar fetchVersionInfo={fetchVersionInfo} />);
    click(container.querySelector('button[aria-label="Operaciones en curso"]'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    click(container.querySelector('button[aria-label="Cerrar"]'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    Object.defineProperty(window, "dwm", { value: originalDwm, configurable: true });
    unmount();
  });
});
