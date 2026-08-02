// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ClientForm } from "../../../../../src/renderer/screens/clients/ClientForm.js";
import { click, mount } from "../../../support/renderHelpers.js";

function setValue(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ClientForm", () => {
  it("valida id, nombre y slug obligatorios", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <ClientForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear cliente"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador es obligatorio.");
    expect(container.textContent).toContain("El nombre es obligatorio.");
    expect(container.textContent).toContain("El slug es obligatorio.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("envía los campos válidos con etiquetas parseadas", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <ClientForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const inputs = container.querySelectorAll("input");
    setValue(inputs[0] as HTMLInputElement, "mci-finance");
    setValue(inputs[1] as HTMLInputElement, "MCI Finance S.L.");
    setValue(inputs[2] as HTMLInputElement, "mci-finance");
    setValue(inputs[3] as HTMLInputElement, "salud, seguros");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear cliente"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({
      id: "mci-finance",
      name: "MCI Finance S.L.",
      slug: "mci-finance",
      tags: ["salud", "seguros"],
    });
    unmount();
  });
});
