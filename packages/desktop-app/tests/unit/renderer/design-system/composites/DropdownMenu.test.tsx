// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "../../../../../src/renderer/design-system/composites/DropdownMenu/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

const items = [
  { id: "edit", label: "Editar", onSelect: vi.fn() },
  { id: "delete", label: "Eliminar", onSelect: vi.fn(), destructive: true },
];

describe("DropdownMenu", () => {
  it("está cerrado por defecto y se abre al pulsar el trigger", () => {
    const { container, unmount } = mount(
      <DropdownMenu label="Acciones" trigger={<button type="button">⋯</button>} items={items} />
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    click(container.querySelector('span[aria-haspopup="menu"]'));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    unmount();
  });

  it("ejecuta onSelect y cierra el menú", () => {
    const onSelect = vi.fn();
    const { container, unmount } = mount(
      <DropdownMenu
        label="Acciones"
        trigger={<button type="button">⋯</button>}
        items={[{ id: "edit", label: "Editar", onSelect }]}
      />
    );
    click(container.querySelector('span[aria-haspopup="menu"]'));
    click(container.querySelector('[role="menuitem"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    unmount();
  });

  it("cierra con Escape", () => {
    const { container, unmount } = mount(
      <DropdownMenu label="Acciones" trigger={<button type="button">⋯</button>} items={items} />
    );
    click(container.querySelector('span[aria-haspopup="menu"]'));
    const root = container.querySelector(".dwm-dropdown-menu") as HTMLElement;
    act(() => {
      root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    unmount();
  });

  it("marca destructive en el item correspondiente", () => {
    const { container, unmount } = mount(
      <DropdownMenu label="Acciones" trigger={<button type="button">⋯</button>} items={items} />
    );
    click(container.querySelector('span[aria-haspopup="menu"]'));
    const deleteItem = Array.from(container.querySelectorAll('[role="menuitem"]')).find(
      (el) => el.textContent === "Eliminar"
    );
    expect(deleteItem?.getAttribute("data-destructive")).toBe("true");
    unmount();
  });
});

describe("DropdownMenu — click fuera y navegación con flechas", () => {
  it("se cierra al hacer click fuera", () => {
    const { container, unmount } = mount(
      <div>
        <DropdownMenu label="Acciones" trigger={<button type="button">⋯</button>} items={items} />
        <button type="button" data-testid="outside">
          Fuera
        </button>
      </div>
    );
    click(container.querySelector('span[aria-haspopup="menu"]'));
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector('[role="menu"]')).toBeNull();
    unmount();
  });

  it("navega con flechas y ejecuta con Enter", () => {
    const onSelect = vi.fn();
    const { container, unmount } = mount(
      <DropdownMenu
        label="Acciones"
        trigger={<button type="button">⋯</button>}
        items={[{ id: "edit", label: "Editar", onSelect }]}
      />
    );
    const root = container.querySelector(".dwm-dropdown-menu") as HTMLElement;
    click(container.querySelector('span[aria-haspopup="menu"]'));
    act(() => {
      root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
      );
      root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true })
      );
      root.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    unmount();
  });
});
