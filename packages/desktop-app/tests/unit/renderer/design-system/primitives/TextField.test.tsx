// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { TextField } from "../../../../../src/renderer/design-system/primitives/TextField/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("TextField", () => {
  it("asocia la etiqueta al input mediante htmlFor/id", () => {
    const { container, unmount } = mount(<TextField label="Nombre" />);
    const label = container.querySelector("label");
    const input = container.querySelector("input");
    expect(label?.getAttribute("for")).toBe(input?.id);
    unmount();
  });

  it("marca el campo como requerido de forma accesible", () => {
    const { container, unmount } = mount(<TextField label="Nombre" required />);
    const input = container.querySelector("input");
    expect(input?.getAttribute("aria-required")).toBe("true");
    unmount();
  });

  it("asocia el hint mediante aria-describedby cuando no hay error", () => {
    const { container, unmount } = mount(
      <TextField label="Email" hint="Formato: nombre@dominio.com" />
    );
    const input = container.querySelector("input");
    const hint = container.querySelector("p");
    expect(input?.getAttribute("aria-describedby")).toBe(hint?.id);
    expect(hint?.textContent).toContain("Formato");
    unmount();
  });

  it("muestra el error con role=alert y aria-invalid, priorizándolo sobre el hint", () => {
    const { container, unmount } = mount(
      <TextField label="Email" hint="ayuda" error="Formato inválido" />
    );
    const input = container.querySelector("input");
    const error = container.querySelector('[role="alert"]');
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(error?.textContent).toBe("Formato inválido");
    expect(container.querySelectorAll("p").length).toBe(1);
    unmount();
  });

  it("reenvía props nativas como onChange y respeta disabled", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(<TextField label="Nombre" disabled onChange={onChange} />);
    const input = container.querySelector("input");
    expect(input?.disabled).toBe(true);
    unmount();
  });
});
