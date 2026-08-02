// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeForm } from "../../../../../src/renderer/screens/knowledge/KnowledgeForm.js";
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

describe("KnowledgeForm", () => {
  it("valida id y contenido obligatorios", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <KnowledgeForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear elemento"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador es obligatorio.");
    expect(container.textContent).toContain("El contenido es obligatorio.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("parsea etiquetas separadas por coma y omite campos vacíos", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <KnowledgeForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const inputs = container.querySelectorAll("input");
    setValue(inputs[0] as HTMLInputElement, "nota-1");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "Contenido de la nota");
    setValue(inputs[1] as HTMLInputElement, " backend, api ,  ");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear elemento"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({
      id: "nota-1",
      content: "Contenido de la nota",
      tags: ["backend", "api"],
    });
    unmount();
  });
});
