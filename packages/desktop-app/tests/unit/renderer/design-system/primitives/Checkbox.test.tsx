// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "../../../../../src/renderer/design-system/primitives/Checkbox/index.js";
import { click, mount } from "../../../support/renderHelpers.js";

describe("Checkbox", () => {
  it("asocia la etiqueta al input", () => {
    const { container, unmount } = mount(<Checkbox label="Acepto" />);
    const label = container.querySelector("label");
    const input = container.querySelector("input");
    expect(label?.getAttribute("for")).toBe(input?.id);
    unmount();
  });

  it("dispara onChange al hacer click", () => {
    const onChange = vi.fn();
    const { container, unmount } = mount(<Checkbox label="Acepto" onChange={onChange} />);
    click(container.querySelector("input"));
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("muestra error asociado con role=alert", () => {
    const { container, unmount } = mount(<Checkbox label="Acepto" error="Debe marcarse" />);
    const input = container.querySelector("input");
    const error = container.querySelector('[role="alert"]');
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(error?.textContent).toBe("Debe marcarse");
    unmount();
  });
});
