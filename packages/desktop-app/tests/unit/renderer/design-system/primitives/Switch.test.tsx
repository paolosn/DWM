// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Switch } from "../../../../../src/renderer/design-system/primitives/Switch/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Switch", () => {
  it("expone role=switch y etiqueta visible", () => {
    const { container, unmount } = mount(<Switch label="Activo" onChange={vi.fn()} />);
    const input = container.querySelector('input[role="switch"]');
    expect(input).not.toBeNull();
    expect(container.textContent).toContain("Activo");
    unmount();
  });

  it("dispara onChange al pulsar", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(<Switch label="Activo" onChange={onChange} />);
    click(container.querySelector("input"));
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("aplica el estado disabled visual y funcional", () => {
    const { container, unmount } = mount(<Switch label="Activo" disabled onChange={vi.fn()} />);
    expect(container.querySelector("input")?.disabled).toBe(true);
    expect(container.querySelector("label")?.className).toContain("dwm-switch--disabled");
    unmount();
  });
});
