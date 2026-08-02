// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ProjectForm } from "../../../../../src/renderer/screens/projects/ProjectForm.js";
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

describe("ProjectForm", () => {
  it("valida todos los campos obligatorios, incluido el perfil", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <ProjectForm
        profileOptions={["default"]}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    expect(container.textContent).toContain("El nombre es obligatorio.");
    expect(container.textContent).toContain("La descripción es obligatoria.");
    expect(container.textContent).toContain("La ruta del proyecto es obligatoria.");
    expect(container.textContent).toContain("Elige un perfil.");
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();
  });

  it("envía los valores completos cuando el formulario es válido", () => {
    const onSubmit = vi.fn();
    const { container, unmount } = mount(
      <ProjectForm
        profileOptions={["default", "cliente-a"]}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    );
    setValue(container.querySelector("input") as HTMLInputElement, "DWM");
    setValue(
      container.querySelector("textarea") as HTMLTextAreaElement,
      "Descripción del proyecto"
    );
    const inputs = container.querySelectorAll("input");
    setValue(inputs[1] as HTMLInputElement, "/Users/paolo/dwm");
    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "cliente-a";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    click(
      Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Crear proyecto"
      ) ?? null
    );
    expect(onSubmit).toHaveBeenCalledWith({
      name: "DWM",
      description: "Descripción del proyecto",
      projectPath: "/Users/paolo/dwm",
      profileId: "cliente-a",
    });
    unmount();
  });
});
