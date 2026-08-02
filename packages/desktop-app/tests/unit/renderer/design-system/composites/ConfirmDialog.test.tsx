// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../../../src/renderer/design-system/composites/ConfirmDialog/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("ConfirmDialog", () => {
  it("llama a onConfirm/onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container, unmount } = mount(
      <ConfirmDialog
        open
        title="Eliminar cliente"
        description="Esta acción no se puede deshacer."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const buttons = Array.from(container.querySelectorAll("button"));
    click(buttons.find((b) => b.textContent === "Confirmar") ?? null);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    click(buttons.find((b) => b.textContent === "Cancelar") ?? null);
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("usa variante destructive cuando corresponde", () => {
    const { container, unmount } = mount(
      <ConfirmDialog
        open
        destructive
        title="Eliminar cliente"
        description="irreversible"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar"
    );
    expect(confirmButton?.dataset.variant).toBe("destructive");
    unmount();
  });

  it("bloquea la confirmación hasta escribir el nombre exacto exigido", () => {
    const onConfirm = vi.fn();
    const { container, unmount } = mount(
      <ConfirmDialog
        open
        title="Eliminar MCI Finance S.L."
        description="Escribe el nombre para confirmar"
        requireTypedConfirmation="MCI Finance S.L."
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    const confirmButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Confirmar"
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const input = container.querySelector("input") as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    nativeSetter?.call(input, "MCI Finance S.L.");
    act(() => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(confirmButton.disabled).toBe(false);
    unmount();
  });
});

describe("ConfirmDialog — children (Módulo 33B) y accesibilidad", () => {
  it("renderiza contenido adicional entre la descripción y la confirmación", () => {
    const { container, unmount } = mount(
      <ConfirmDialog
        open
        title="Restaurar backup"
        description="Puede sobrescribir datos actuales."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <span data-testid="extra-content">Interruptor adicional</span>
      </ConfirmDialog>
    );
    expect(container.querySelector('[data-testid="extra-content"]')).not.toBeNull();
    unmount();
  });

  it("mantiene el focus trap y el rol de diálogo con contenido adicional", () => {
    const { container, unmount } = mount(
      <ConfirmDialog
        open
        title="Restaurar backup"
        description="desc"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      >
        <button type="button">Extra</button>
      </ConfirmDialog>
    );
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.contains(document.activeElement)).toBe(true);
    unmount();
  });
});
