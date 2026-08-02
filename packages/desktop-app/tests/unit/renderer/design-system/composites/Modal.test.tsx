// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../../../../../src/renderer/design-system/composites/Modal/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Modal", () => {
  it("no renderiza nada cuando open=false", () => {
    const { container, unmount } = mount(
      <Modal open={false} title="Eliminar agente" onClose={vi.fn()}>
        contenido
      </Modal>
    );
    expect(container.querySelector('[data-testid="modal-overlay"]')).toBeNull();
    unmount();
  });

  it("renderiza con role=dialog y aria-modal cuando open=true", () => {
    const { container, unmount } = mount(
      <Modal open title="Eliminar agente" onClose={vi.fn()}>
        contenido
      </Modal>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    unmount();
  });

  it("cierra con el botón de la cabecera y con Escape", () => {
    const onClose = vi.fn();
    const { container, unmount } = mount(
      <Modal open title="Eliminar agente" onClose={onClose}>
        contenido
      </Modal>
    );
    click(container.querySelector('button[aria-label="Cerrar"]'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("mueve el foco dentro del diálogo al abrirse", () => {
    const { container, unmount } = mount(
      <Modal open title="Eliminar agente" onClose={vi.fn()}>
        contenido
      </Modal>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(document.activeElement === dialog || dialog?.contains(document.activeElement)).toBe(
      true
    );
    unmount();
  });

  it("renderiza el footer cuando se provee", () => {
    const { container, unmount } = mount(
      <Modal open title="t" onClose={vi.fn()} footer={<button type="button">Guardar</button>}>
        contenido
      </Modal>
    );
    expect(container.querySelector(".dwm-modal__footer")?.textContent).toBe("Guardar");
    unmount();
  });
});
