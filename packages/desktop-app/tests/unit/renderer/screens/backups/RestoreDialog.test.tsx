// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { RestoreDialog } from "../../../../../src/renderer/screens/backups/RestoreDialog.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("RestoreDialog", () => {
  it("por defecto pide confirmar en modo de prueba (dryRun:true)", () => {
    const onConfirm = vi.fn();
    const { container, unmount } = mount(
      <RestoreDialog backupId="b1" submitting={false} onCancel={vi.fn()} onConfirm={onConfirm} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Ejecutar en modo de prueba"
      ) ?? null
    );
    expect(onConfirm).toHaveBeenCalledWith({ dryRun: true });
    unmount();
  });

  it("desactivar el interruptor pide confirmar una restauración real (dryRun:false)", () => {
    const onConfirm = vi.fn();
    const { container, unmount } = mount(
      <RestoreDialog backupId="b1" submitting={false} onCancel={vi.fn()} onConfirm={onConfirm} />
    );
    const toggle = container.querySelector('input[role="switch"]') as HTMLInputElement;
    act(() => {
      toggle.click();
    });
    expect(container.textContent).toContain("Restaurar de verdad");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Restaurar de verdad"
      ) ?? null
    );
    expect(onConfirm).toHaveBeenCalledWith({ dryRun: false });
    unmount();
  });

  it("no renderiza nada cuando no hay backupId", () => {
    const { container, unmount } = mount(
      <RestoreDialog
        backupId={undefined}
        submitting={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    unmount();
  });
});
