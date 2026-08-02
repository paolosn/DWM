// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { SkillForm } from "../../../../../src/renderer/screens/skills/SkillForm.js";
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

describe("SkillForm", () => {
  it("valida campos obligatorios", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <SkillForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "   ");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear skill"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador es obligatorio.");
    expect(container.textContent).toContain("El contenido de SKILL.md es obligatorio.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("envía id y content cuando es válido", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <SkillForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    setValue(container.querySelector("input") as HTMLInputElement, "mi-skill");
    setValue(container.querySelector("textarea") as HTMLTextAreaElement, "# SKILL.md\ncontenido");
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear skill"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({ id: "mi-skill", content: "# SKILL.md\ncontenido" });
    unmount();
  });
});
