// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { RuleForm } from "../../../../../src/renderer/screens/rules/RuleForm.js";
import { click, mount } from "../../../support/renderHelpers.js";

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("RuleForm", () => {
  it("valida campos obligatorios", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <RuleForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear regla"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador es obligatorio.");
    expect(container.textContent).toContain("El contenido es obligatorio.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("envía id y content cuando es válido", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <RuleForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    setValue(container.querySelector("input") as HTMLInputElement, "mi-regla");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "# Regla\ncontenido");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear regla"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({ id: "mi-regla", content: "# Regla\ncontenido" });
    unmount();
  });
});
