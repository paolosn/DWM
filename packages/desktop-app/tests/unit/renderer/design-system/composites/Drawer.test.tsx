// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "../../../../../src/renderer/design-system/composites/Drawer/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Drawer", () => {
  it("no renderiza nada cuando open=false", () => {
    const { container, unmount } = mount(
      <Drawer open={false} title="Detalle" onClose={vi.fn()}>
        contenido
      </Drawer>
    );
    expect(container.querySelector('[data-testid="drawer-overlay"]')).toBeNull();
    unmount();
  });

  it("renderiza role=dialog y cierra con el botón, Escape y clic en el overlay", () => {
    const onClose = vi.fn();
    const { container, unmount } = mount(
      <Drawer open title="Detalle" onClose={onClose}>
        contenido
      </Drawer>
    );
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");

    click(container.querySelector('button[aria-label="Cerrar"]'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    const overlay = container.querySelector('[data-testid="drawer-overlay"]') as HTMLElement;
    click(overlay);
    expect(onClose).toHaveBeenCalledTimes(3);
    unmount();
  });

  it("no cierra al hacer click dentro del panel", () => {
    const onClose = vi.fn();
    const { container, unmount } = mount(
      <Drawer open title="Detalle" onClose={onClose}>
        <button type="button">Acción interna</button>
      </Drawer>
    );
    const inner = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Acción interna"
    );
    click(inner ?? null);
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });
});
