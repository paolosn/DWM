// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../../../../src/renderer/design-system/primitives/Button/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Button", () => {
  it("renderiza la variante primaria por defecto", () => {
    const { container, unmount } = mount(<Button>Guardar</Button>);
    const button = container.querySelector("button");
    expect(button?.dataset.variant).toBe("primary");
    expect(button?.textContent).toContain("Guardar");
    unmount();
  });

  it("renderiza variantes secondary y destructive", () => {
    const { container, unmount } = mount(
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="destructive">Eliminar</Button>
      </>
    );
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]?.dataset.variant).toBe("secondary");
    expect(buttons[1]?.dataset.variant).toBe("destructive");
    unmount();
  });

  it("dispara onClick al pulsar", () => {
    const onClick = vi.fn();
    const { container, unmount } = mount(<Button onClick={onClick}>Enviar</Button>);
    click(container.querySelector("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("se deshabilita y muestra spinner en estado loading, sin disparar onClick", () => {
    const onClick = vi.fn();
    const { container, unmount } = mount(
      <Button loading onClick={onClick}>
        Guardando
      </Button>
    );
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[data-testid="button-spinner"]')).not.toBeNull();
    click(button);
    expect(onClick).not.toHaveBeenCalled();
    unmount();
  });

  it("respeta disabled explícito", () => {
    const { container, unmount } = mount(<Button disabled>Bloqueado</Button>);
    expect(container.querySelector("button")?.disabled).toBe(true);
    unmount();
  });

  it("renderiza un icono inicial cuando no está en loading", () => {
    const { container, unmount } = mount(
      <Button leadingIcon={<span data-testid="ico" />}>Con icono</Button>
    );
    expect(container.querySelector('[data-testid="ico"]')).not.toBeNull();
    unmount();
  });
});
