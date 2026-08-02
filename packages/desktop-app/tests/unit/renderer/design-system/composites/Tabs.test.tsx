// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "../../../../../src/renderer/design-system/composites/Tabs/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const items = [
  { id: "summary", label: "Resumen", content: <p>Contenido resumen</p> },
  { id: "sessions", label: "Sesiones", content: <p>Contenido sesiones</p> },
  { id: "backups", label: "Backups", content: <p>Contenido backups</p>, disabled: true },
];

describe("Tabs", () => {
  it("muestra el panel de la primera pestaña por defecto", () => {
    const { container, unmount } = mount(<Tabs items={items} />);
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe("Contenido resumen");
    unmount();
  });

  it("cambia de panel al pulsar otra pestaña", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(<Tabs items={items} onChange={onChange} />);
    const buttons = Array.from(container.querySelectorAll('[role="tab"]'));
    click(buttons[1] ?? null);
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe("Contenido sesiones");
    expect(onChange).toHaveBeenCalledWith("sessions");
    unmount();
  });

  it("navega con ArrowRight a la siguiente pestaña habilitada", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(<Tabs items={items} onChange={onChange} />);
    const list = container.querySelector('[role="tablist"]') as HTMLElement;
    act(() => {
      list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toBe("Contenido sesiones");
    expect(onChange).toHaveBeenCalledWith("sessions");
    unmount();
  });

  it("respeta disabled en las pestañas", () => {
    const { container, unmount } = mount(<Tabs items={items} />);
    const buttons = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(buttons[2]?.disabled).toBe(true);
    unmount();
  });
});
