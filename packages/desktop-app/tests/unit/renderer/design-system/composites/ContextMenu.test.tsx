// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../../../../../src/renderer/design-system/composites/ContextMenu/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("ContextMenu", () => {
  it("se abre con contextmenu y ejecuta la acción elegida", () => {
    const onSelect = vi.fn();
    const { container, unmount } = mount(
      <ContextMenu items={[{ id: "archive", label: "Archivar", onSelect }]}>
        <div data-testid="row">Fila</div>
      </ContextMenu>
    );
    const row = container.querySelector('[data-testid="row"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
    });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    click(container.querySelector('[role="menuitem"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("ContextMenu — cierre", () => {
  it("se cierra al hacer click fuera y con Escape", () => {
    const { container, unmount } = mount(
      <ContextMenu items={[{ id: "archive", label: "Archivar", onSelect: vi.fn() }]}>
        <div data-testid="row">Fila</div>
      </ContextMenu>
    );
    const row = container.querySelector('[data-testid="row"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
    });
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();

    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    unmount();
  });

  it("una acción deshabilitada no se puede pulsar", () => {
    const onSelect = vi.fn();
    const { container, unmount } = mount(
      <ContextMenu items={[{ id: "archive", label: "Archivar", onSelect, disabled: true }]}>
        <div data-testid="row">Fila</div>
      </ContextMenu>
    );
    const row = container.querySelector('[data-testid="row"]') as HTMLElement;
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }));
    });
    const item = container.querySelector('[role="menuitem"]') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    unmount();
  });
});
