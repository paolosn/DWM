// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { AgentForm } from "../../../../../src/renderer/screens/agents/AgentForm.js";
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

describe("AgentForm", () => {
  it("valida el identificador vacío y no llama a onSubmit", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <AgentForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );
    expect(container.textContent).toContain("El identificador es obligatorio.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("acepta cualquier contenido Markdown (no exige una estructura JSON)", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <AgentForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "mi-agente");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    setValue(textarea, "---\ndescription: Prueba\nmode: all\n---\n\n# Mi Agente\n");

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({
      id: "mi-agente",
      content: "---\ndescription: Prueba\nmode: all\n---\n\n# Mi Agente\n",
    });
    unmount();
  });

  it("llama a onSubmit con id y content cuando el formulario es válido", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <AgentForm submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />
    );
    const input = container.querySelector("input") as HTMLInputElement;
    setValue(input, "mi-agente");
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    setValue(textarea, '{"name":"Mi agente"}');

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear agente"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({ id: "mi-agente", content: '{"name":"Mi agente"}' });
    unmount();
  });

  it("deshabilita ambos botones mientras submitting=true y muestra loading", () => {
    const { container, unmount } = mount(
      <AgentForm submitting onSubmit={vi.fn()} onCancel={vi.fn()} />
    );
    const buttons = Array.from(container.querySelectorAll("button")) as HTMLButtonElement[];
    expect(buttons.every((b) => b.disabled)).toBe(true);
    unmount();
  });

  it("llama a onCancel al pulsar Cancelar", () => {
    const onCancel = vi.fn();
    const { container, unmount } = mount(
      <AgentForm submitting={false} onSubmit={vi.fn()} onCancel={onCancel} />
    );
    click(
      Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Cancelar") ??
        null
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});
