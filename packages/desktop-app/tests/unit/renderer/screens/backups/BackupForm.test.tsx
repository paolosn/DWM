// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { BackupForm } from "../../../../../src/renderer/screens/backups/BackupForm.js";
import { click, mount } from "../../../support/renderHelpers.js";

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("BackupForm", () => {
  it("valida identificador de recurso y ruta destino obligatorios", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <BackupForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear backup"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador del recurso es obligatorio.");
    expect(container.textContent).toContain("La ruta destino es obligatoria.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("envía los valores completos, incluidos tipo y tipo de recurso por defecto", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <BackupForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const inputs = container.querySelectorAll("input");
    setValue(inputs[0] as HTMLInputElement, "Backup diario");
    setValue(inputs[1] as HTMLInputElement, "Descripción");
    setValue(inputs[2] as HTMLInputElement, "ws-1");
    setValue(inputs[3] as HTMLInputElement, "/x/backup.zip");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear backup"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Backup diario",
      description: "Descripción",
      type: "full",
      resourceType: "workspace",
      resourceId: "ws-1",
      targetPath: "/x/backup.zip",
    });
    unmount();
  });

  it("permite elegir tipo selectivo y tipo de recurso proyecto", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <BackupForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const selects = container.querySelectorAll("select");
    act(() => {
      (selects[0] as HTMLSelectElement).value = "selective";
      selects[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      (selects[1] as HTMLSelectElement).value = "project";
      selects[1]?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const inputs = container.querySelectorAll("input");
    setValue(inputs[2] as HTMLInputElement, "proj-1");
    setValue(inputs[3] as HTMLInputElement, "/x/b.zip");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear backup"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "selective", resourceType: "project" })
    );
    unmount();
  });

  it("llama a onCancel", () => {
    const onCancel = vi.fn();
    const { container, unmount } = mount(
      <BackupForm submitting={false} onSubmit={vi.fn()} onCancel={onCancel} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Cancelar") ??
        null
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});
