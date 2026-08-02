// @vitest-environment jsdom
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import { Tooltip } from "../../../../../src/renderer/design-system/composites/Tooltip/index.js";
import { mount } from "../../../support/renderHelpers.js";

describe("Tooltip", () => {
  it("está oculto por defecto y asociado vía aria-describedby", () => {
    const { container, unmount } = mount(
      <Tooltip content="Cerrar ventana">
        <button type="button">×</button>
      </Tooltip>
    );
    const button = container.querySelector("button");
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(button?.getAttribute("aria-describedby")).toBe(tooltip?.id);
    expect(tooltip?.hasAttribute("hidden")).toBe(true);
    unmount();
  });

  it("se muestra con foco de teclado y se oculta al perder el foco", () => {
    const { container, unmount } = mount(
      <Tooltip content="Cerrar ventana">
        <button type="button">×</button>
      </Tooltip>
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.focus();
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]')?.hasAttribute("hidden")).toBe(false);
    act(() => {
      button.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]')?.hasAttribute("hidden")).toBe(true);
    unmount();
  });
});

describe("Tooltip — hover", () => {
  it("se muestra con mouseenter y se oculta con mouseleave", () => {
    const { container, unmount } = mount(
      <Tooltip content="Cerrar ventana">
        <button type="button">×</button>
      </Tooltip>
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]')?.hasAttribute("hidden")).toBe(false);
    act(() => {
      button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]')?.hasAttribute("hidden")).toBe(true);
    unmount();
  });
});
