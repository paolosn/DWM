// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../../../../../src/renderer/design-system/primitives/IconButton/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("IconButton", () => {
  it("expone nombre accesible mediante aria-label", () => {
    const { container, unmount } = mount(
      <IconButton label="Cerrar" icon={<span aria-hidden="true">×</span>} />
    );
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Cerrar");
    expect(button?.getAttribute("title")).toBe("Cerrar");
    unmount();
  });

  it("dispara onClick", () => {
    const onClick = vi.fn();
    const { container, unmount } = mount(
      <IconButton label="Actualizar" icon={<span />} onClick={onClick} />
    );
    click(container.querySelector("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("muestra spinner y se deshabilita en loading", () => {
    const { container, unmount } = mount(<IconButton label="Guardando" icon={<span />} loading />);
    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="icon-button-spinner"]')).not.toBeNull();
    unmount();
  });
});
